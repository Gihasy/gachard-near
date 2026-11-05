/**
 * Everything that talks to the chain.
 *
 * Users have their own sub-account and sign what they do, but they never hold
 * gas money. Their signed action goes in a meta transaction (NEP-366), and the
 * platform pays both the gas and the 1 yocto deposit. `near-e2e/e2e.mjs` proves
 * this against testnet.
 */
import { createHmac } from "node:crypto";
import { Account, JsonRpcProvider, KeyPair, actions, teraToGas } from "near-api-js";
import { decrypt, encrypt } from "./crypto.ts";

const ACCOUNT_FUNDING = 2_000_000_000_000_000_000_000n; // 0.002 NEAR, storage only

export class ContractRefused extends Error {}

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Run npm run setup.`);
  return value;
}

export const contractId = () => env("NEAR_CONTRACT");
export const platformId = () => env("NEAR_PLATFORM_ACCOUNT");
export const explorer = {
  tx: (hash: string) => `https://testnet.nearblocks.io/txns/${hash}`,
  account: (id: string) => `https://testnet.nearblocks.io/address/${id}`,
};

const provider = () =>
  new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com" });

const platform = () => new Account(platformId(), provider(), env("NEAR_PLATFORM_KEY") as `ed25519:${string}`);

// One platform key means one nonce sequence, so its transactions go in turn.
const shared = globalThis as unknown as { gachardTxQueue?: Promise<unknown> };
function inTurn<T>(send: () => Promise<T>): Promise<T> {
  const run = (shared.gachardTxQueue ?? Promise.resolve()).then(() => retryOnNonce(send));
  shared.gachardTxQueue = run.catch(() => undefined);
  return run;
}

// Two failures that are safe to resend, because nothing reached the chain:
// - InvalidNonce: the queue covers one process. Serverless runs several, and they
//   can pick the same nonce, so the chain rejects the transaction outright.
// - AccessKeyDoesNotExist: a new account's key has not reached this RPC node yet,
//   so signing failed before anything was sent.
async function retryOnNonce<T>(send: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await send();
    } catch (error) {
      const message = `${(error as Error)?.name ?? ""} ${(error as Error)?.message ?? error}`;
      if (attempt >= 5 || !/InvalidNonce|AccessKeyDoesNotExist|Access key .* does not exist/i.test(message)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 400 + Math.random() * 500 * (attempt + 1)));
    }
  }
}

interface Outcome {
  transaction?: { hash?: string };
  transaction_outcome?: { id?: string; outcome?: { status?: unknown } };
  status?: unknown;
  receipts_outcome?: { outcome?: { status?: unknown } }[];
}

/** A meta transaction reports failure in its receipts, not always at the top. */
function settle(outcome: Outcome): { hash: string; value: unknown } {
  const statuses = [
    outcome.status,
    outcome.transaction_outcome?.outcome?.status,
    ...(outcome.receipts_outcome ?? []).map((r) => r.outcome?.status),
  ] as { Failure?: unknown; SuccessValue?: string }[];

  const failure = statuses.find((s) => s?.Failure)?.Failure;
  if (failure) {
    const text = JSON.stringify(failure);
    const panic = text.match(/Smart contract panicked: ([^"\\]+)/);
    if (panic) throw new ContractRefused(panic[1]);
    throw new Error(`Transaction failed: ${text.slice(0, 300)}`);
  }

  const encoded = statuses.find((s) => s?.SuccessValue)?.SuccessValue;
  return {
    hash: outcome.transaction?.hash ?? outcome.transaction_outcome?.id ?? "",
    value: encoded ? JSON.parse(Buffer.from(encoded, "base64").toString()) : undefined,
  };
}

export function view<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  return provider().callFunction({ contractId: contractId(), method, args }) as Promise<T>;
}

/** A call signed and paid for by the platform: approving a creator, or minting. */
export async function platformCall(method: string, args: Record<string, unknown>, tgas = 100) {
  const outcome = await inTurn(() =>
    platform().signAndSendTransaction({
      receiverId: contractId(),
      throwOnFailure: false,
      actions: [actions.functionCall(method, args, teraToGas(tgas), 0n)],
    }),
  );
  return settle(outcome as Outcome);
}

/** A call signed by the user, submitted and paid for by the platform. */
export async function userCall(
  user: { accountId: string; keyEncrypted: string },
  method: string,
  args: Record<string, unknown>,
  deposit = 0n,
) {
  const signer = new Account(
    user.accountId,
    provider(),
    decrypt(user.keyEncrypted) as `ed25519:${string}`,
  );
  const outcome = await inTurn(async () => {
    const { signedDelegate } = await signer.createSignedMetaTransaction({
      receiverId: contractId(),
      actions: [actions.functionCall(method, args, teraToGas(60), deposit)],
      blockHeightTtl: 120,
    });
    return platform().relayMetaTransaction(signedDelegate);
  });
  return settle(outcome as Outcome);
}

/**
 * Creates the hidden account for a new user. The name is an HMAC of their id, so
 * it carries no personal data and is stable (ADR-042, decision 5).
 */
export async function createUserAccount(userId: string) {
  const label = createHmac("sha256", env("ENCRYPTION_SECRET_KEY"))
    .update(`account:${userId}`)
    .digest("hex")
    .slice(0, 12);
  const keyPair = KeyPair.fromRandom("ed25519");
  await inTurn(() =>
    platform().createSubAccount({
      accountOrPrefix: `c-${label}`,
      publicKey: keyPair.getPublicKey().toString(),
      nearToTransfer: ACCOUNT_FUNDING,
    }),
  );
  return { accountId: `c-${label}.${platformId()}`, keyEncrypted: encrypt(keyPair.toString()) };
}

const LABEL = /^c-([0-9a-f]{12})\./;

/** The public name for an account. Stable, anonymous, and readable from the chain. */
export function collectorLabel(accountId: string): string {
  const match = accountId.match(LABEL);
  return match ? `Collector #${match[1].slice(0, 6).toUpperCase()}` : accountId;
}

/** An anonymous starting username, so a new account can receive a card at once. */
export function defaultUsername(accountId: string): string {
  const match = accountId.match(LABEL);
  return `collector_${(match?.[1] ?? accountId).slice(0, 8).toLowerCase()}`;
}
