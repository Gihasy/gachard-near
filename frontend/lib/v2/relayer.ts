/**
 * Sends v2 transactions from the Relayer keys (ADR-040, docs/PLAN-STORE-V2.md
 * phase 0). The store routes reach it through store-chain.ts.
 *
 * - Every call is simulated first, so a revert is decoded into its custom error
 *   and thrown before any gas is spent.
 * - Each send reads a fresh pending nonce. A nonce clash is retried once.
 * - Retrying is safe because v2 makes repeats revert instead of running twice:
 *   `purchaseId` for purchases, signature nonces for holder actions. That is
 *   what retires ADR-031's hazard, where the RPC reports "could not coalesce"
 *   for a write that in fact landed. `isAlreadyDone` recognises those reverts,
 *   so the caller can treat them as success after checking state.
 * - The relayer never holds a holder's key. Holder signatures come from
 *   `custodial.ts` or from the user's Privy wallet.
 *
 * The ABI fragments below are checked against the compiled contracts by
 * scripts/v2-local.test.mjs, so they cannot drift silently.
 *
 * Imports only `ethers`, so the integration test can load it with Node's type
 * stripping.
 */
import { Contract, Interface, JsonRpcProvider, Wallet, isError, type Log, type TransactionReceipt } from "ethers";

const COMMON_ERRORS = [
  "error AccessControlUnauthorizedAccount(address account, bytes32 neededRole)",
  "error EnforcedPause()",
  "error LimitExceeded(bytes32 action, address account, uint256 requested, uint256 remaining)",
  "error ReentrancyGuardReentrantCall()",
];

export const CARDS_ABI = [
  "function transferWithSig(address from, address to, uint256[] ids, uint256 nonce, uint256 deadline, bytes signature)",
  "function burnWithSig(address holder, uint256[] ids, uint256 nonce, uint256 deadline, bytes signature)",
  "function requestPrintWithSig(address holder, uint256 id, bytes32 commit, uint256 nonce, uint256 deadline, bytes signature)",
  "function cancelPrintWithSig(address holder, uint256 id, uint256 nonce, uint256 deadline, bytes signature)",
  "function redeem(uint256 id, bytes code, address recipient)",
  "function recordRisk(uint256 id, uint8 score, bool flagged)",
  "function holderOf(uint256 id) view returns (address)",
  "function templateOf(uint256 id) view returns (uint32)",
  "function cardOf(uint256 id) view returns (tuple(uint32 templateId, uint8 status, uint32 printCycle, uint32 serial, uint40 mintedAt))",
  "function remaining(uint32 templateId, uint8 channel) view returns (uint256)",
  "function nonceUsed(address holder, uint256 nonce) view returns (bool)",
  "function paused() view returns (bool)",
  "event CardMinted(uint256 indexed tokenId, address indexed to, uint32 indexed templateId, uint32 serial)",
  "event CardBurned(uint256 indexed tokenId, address indexed holder, uint32 indexed templateId)",
  "event Redeemed(uint256 indexed tokenId, address indexed from, address indexed to, uint32 printCycle)",
  "error ZeroAddress()",
  "error BadBatch(uint256 length)",
  "error UnknownTemplate(uint32 templateId)",
  "error TemplateNotLive(uint32 templateId)",
  "error BadTemplate(uint32 templateId)",
  "error SupplyExhausted(uint32 templateId, uint8 channel)",
  "error WrongKind(uint256 tokenId)",
  "error WrongStatus(uint256 tokenId, uint8 status)",
  "error Soulbound(uint256 tokenId)",
  "error NotBurnable(uint256 tokenId)",
  "error NotHolder(uint256 tokenId, address account)",
  "error InvalidAmount(uint256 tokenId, uint256 amount)",
  "error BadSignature()",
  "error SignatureExpired(uint256 deadline)",
  "error DeadlineTooFar(uint256 deadline)",
  "error NonceAlreadyUsed(address holder, uint256 nonce)",
  "error BadRedeemCode(uint256 tokenId)",
  "error EmptyCommit()",
  ...COMMON_ERRORS,
];

export const STORE_ABI = [
  "function commitRotation(uint256 rotationId, bytes32 secretHash, uint40 endsAt, uint40 revealAfter)",
  "function requestRotationEntropy(uint256 rotationId) returns (uint64)",
  "function revealRotation(uint256 rotationId, bytes32 secret)",
  "function purchase(bytes32 purchaseId, address buyer, uint256 rotationId, uint32[] templateIds, uint256 deadline, bytes attestation) returns (uint256)",
  "function rotation(uint256 rotationId) view returns (tuple(bytes32 secretHash, bytes32 seed, bytes32 secret, uint40 endsAt, uint40 revealAfter, uint64 sequence, bool seedRequested, bool revealed))",
  "function rotationOverdue(uint256 rotationId) view returns (bool)",
  "function purchaseHashOf(bytes32 purchaseId) view returns (bytes32)",
  "function attestor() view returns (address)",
  "event RotationEntropyRequested(uint256 indexed rotationId, uint64 sequence)",
  "event RotationSeeded(uint256 indexed rotationId, bytes32 seed)",
  "event Purchased(bytes32 indexed purchaseId, address indexed buyer, uint256 indexed rotationId, uint32[] templateIds, uint256 firstTokenId)",
  "error ZeroAddress()",
  "error BadBatch(uint256 length)",
  "error AlreadyCommitted(uint256 rotationId)",
  "error NotCommitted(uint256 rotationId)",
  "error BadRotationTimes()",
  "error EntropyAlreadyRequested(uint256 rotationId)",
  "error InsufficientFeeBalance(uint256 fee, uint256 balance)",
  "error StoreNotReady(uint256 rotationId)",
  "error RotationClosed(uint256 rotationId)",
  "error TooEarlyToReveal(uint256 rotationId, uint256 revealAfter)",
  "error AlreadyRevealed(uint256 rotationId)",
  "error SecretMismatch(uint256 rotationId)",
  "error PurchaseAlreadyRecorded(bytes32 purchaseId)",
  "error BadAttestation()",
  "error SignatureExpired(uint256 deadline)",
  "error DeadlineTooFar(uint256 deadline)",
  ...COMMON_ERRORS,
];

export const ALBUMS_ABI = [
  "function placeInAlbum(address holder, uint256 seasonId, uint256[] ids, uint16[] slots, uint256 nonce, uint256 deadline, bytes signature)",
  "function wishIntoAlbum(address holder, uint256 seasonId, uint16 slot, uint256 nonce, uint256 deadline, bytes holderSignature, bytes attestation) returns (uint256)",
  "function claimRewards(address holder, uint256 seasonId, uint256 deadline, bytes attestation) returns (uint256, uint256)",
  "function filledCount(uint256 seasonId, address holder) view returns (uint16)",
  "function slotToken(uint256 seasonId, address holder, uint16 slot) view returns (uint256)",
  "function season(uint256 seasonId) view returns (tuple(uint32 seriesId, uint32 limitedTemplateId, uint32 completionTemplateId, uint40 startsAt, uint40 endsAt, uint16 slotCount, uint32 completions, bool exists))",
  "function slotTemplates(uint256 seasonId) view returns (uint32[])",
  "function rewardClaimed(uint256 seasonId, address holder) view returns (bool)",
  "event CardsPlaced(uint256 indexed seasonId, address indexed holder, uint256[] ids, uint16[] slots)",
  "event Wished(uint256 indexed seasonId, address indexed holder, uint16 slot, uint256 tokenId)",
  "event RewardsClaimed(uint256 indexed seasonId, address indexed holder, uint32 serial, uint256 completionTokenId, uint256 limitedTokenId)",
  "error UnknownSeason(uint256 seasonId)",
  "error SeasonNotActive(uint256 seasonId)",
  "error LengthMismatch()",
  "error BadBatch(uint256 length)",
  "error SlotOutOfRange(uint16 slot)",
  "error SlotTaken(uint16 slot)",
  "error WrongTemplateForSlot(uint256 tokenId, uint16 slot)",
  "error AlbumIncomplete(uint16 filled, uint16 needed)",
  "error AlreadyClaimed(uint256 seasonId, address holder)",
  "error BadSignature()",
  "error BadAttestation()",
  "error SignatureExpired(uint256 deadline)",
  "error DeadlineTooFar(uint256 deadline)",
  "error NonceAlreadyUsed(address holder, uint256 nonce)",
  ...COMMON_ERRORS,
];

export type V2Target = "cards" | "store" | "albums";

export interface V2Config {
  rpcUrl: string;
  cards: string;
  store: string;
  albums: string;
  relayerKeys: string[];
}

/** V2_RPC_URL, V2_CARDS, V2_STORE, V2_ALBUMS, V2_RELAYER_KEYS (comma-separated). */
export function v2ConfigFromEnv(env: Record<string, string | undefined> = process.env): V2Config {
  const need = (name: string) => {
    const value = env[name]?.trim();
    if (!value) throw new Error(`${name} is not set`);
    return value;
  };
  return {
    rpcUrl: env.V2_RPC_URL?.trim() || "https://testnet-rpc.monad.xyz",
    cards: need("V2_CARDS"),
    store: need("V2_STORE"),
    albums: need("V2_ALBUMS"),
    relayerKeys: need("V2_RELAYER_KEYS")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean),
  };
}

/** A decoded contract revert, e.g. name "PurchaseAlreadyRecorded". */
export class V2Error extends Error {
  readonly errorName: string;
  readonly errorArgs: readonly unknown[];

  constructor(errorName: string, errorArgs: readonly unknown[], cause?: unknown) {
    super(`v2 contract reverted: ${errorName}`, { cause });
    this.name = "V2Error";
    this.errorName = errorName;
    this.errorArgs = errorArgs;
  }
}

const ALREADY_DONE = new Set([
  "PurchaseAlreadyRecorded",
  "NonceAlreadyUsed",
  "AlreadyCommitted",
  "EntropyAlreadyRequested",
  "AlreadyRevealed",
  "AlreadyClaimed",
]);

/** True for reverts that mean "this exact action has already happened". Check state, then treat as done. */
export function isAlreadyDone(err: unknown): boolean {
  return err instanceof V2Error && ALREADY_DONE.has(err.errorName);
}

const INTERFACES = [new Interface(CARDS_ABI), new Interface(STORE_ABI), new Interface(ALBUMS_ABI)];

function revertData(err: unknown): string | null {
  let e: unknown = err;
  for (let depth = 0; e && depth < 5; depth++) {
    const data = (e as { data?: unknown }).data;
    if (typeof data === "string" && data.startsWith("0x") && data.length >= 10) return data;
    e = (e as { error?: unknown; info?: { error?: unknown } }).error ?? (e as { info?: { error?: unknown } }).info?.error;
  }
  return null;
}

/** Turn a revert from any of the three contracts, or a ledger call nested in a module, into a V2Error. */
export function decodeV2Error(err: unknown): unknown {
  const data = revertData(err);
  if (!data) return err;
  for (const iface of INTERFACES) {
    try {
      const parsed = iface.parseError(data);
      if (parsed) return new V2Error(parsed.name, [...parsed.args], err);
    } catch {
      // not this contract's error
    }
  }
  return err;
}

export class V2Relayer {
  readonly provider: JsonRpcProvider;
  readonly wallets: Wallet[];
  private readonly addresses: Record<V2Target, string>;
  private readonly abis: Record<V2Target, string[]> = { cards: CARDS_ABI, store: STORE_ABI, albums: ALBUMS_ABI };
  private next: number;
  /** The next nonce this instance will use per relayer address. */
  private readonly nonces = new Map<string, number>();

  constructor(config: V2Config, provider?: JsonRpcProvider) {
    if (config.relayerKeys.length === 0) throw new Error("no relayer key");
    this.provider = provider ?? new JsonRpcProvider(config.rpcUrl);
    this.wallets = config.relayerKeys.map((k) => new Wallet(k, this.provider));
    this.addresses = { cards: config.cards, store: config.store, albums: config.albums };
    // Instances start at different keys, so serverless copies spread their load.
    this.next = Math.floor(Math.random() * this.wallets.length);
  }

  contract(target: V2Target, runner: Wallet | JsonRpcProvider = this.provider): Contract {
    return new Contract(this.addresses[target], this.abis[target], runner);
  }

  /** Read-only call, with reverts decoded. */
  async read<T = unknown>(target: V2Target, method: string, args: unknown[] = []): Promise<T> {
    try {
      return (await this.contract(target).getFunction(method).staticCall(...args)) as T;
    } catch (err) {
      throw decodeV2Error(err);
    }
  }

  /**
   * Simulate, then send from one Relayer key.
   * Returns once the transaction is accepted by the node (ADR-018: the caller
   * records it and confirms it later), never after waiting for a block.
   */
  async send(target: V2Target, method: string, args: unknown[]): Promise<{ hash: string; relayer: string }> {
    const wallet = this.wallets[this.next++ % this.wallets.length];
    const fn = this.contract(target, wallet).getFunction(method);
    try {
      await fn.staticCall(...args);
    } catch (err) {
      throw decodeV2Error(err);
    }
    for (let attempt = 0; ; attempt++) {
      const nonce = await this.nextNonce(wallet.address);
      try {
        const tx = await fn.send(...args, { nonce });
        return { hash: tx.hash, relayer: wallet.address };
      } catch (err) {
        const nonceClash = isError(err, "NONCE_EXPIRED") || isError(err, "REPLACEMENT_UNDERPRICED");
        if (nonceClash && attempt < 3) continue;
        throw decodeV2Error(err);
      }
    }
  }

  /**
   * Poll for the receipt itself. ethers' waitForTransaction waits for a *new*
   * block after the one it last saw, and a chain that only mines when a
   * transaction arrives (anvil) never produces one: that hung the integration
   * test. Asking for the receipt directly works on any chain.
   */
  async waitForReceipt(hash: string, timeoutMs = 60_000): Promise<TransactionReceipt> {
    const started = Date.now();
    for (;;) {
      const receipt = await this.provider.getTransactionReceipt(hash);
      if (receipt) return receipt;
      if (Date.now() - started > timeoutMs) throw new Error(`no receipt for ${hash} after ${timeoutMs} ms`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  /**
   * The larger of the chain's pending count and the next nonce this instance
   * has handed out.
   * - The count is read with a raw RPC call. ethers dedupes identical requests
   *   for about 250 ms, and two sends from one key inside that window got the
   *   same stale count ("nonce too low" in the integration test).
   * - The local counter covers back-to-back sends from this instance. The
   *   chain count covers other serverless instances using the same key.
   */
  private async nextNonce(address: string): Promise<number> {
    const chain = Number(await this.provider.send("eth_getTransactionCount", [address, "pending"]));
    const nonce = Math.max(chain, this.nonces.get(address) ?? 0);
    this.nonces.set(address, nonce + 1);
    return nonce;
  }

  /** For scripts and tests: send, wait for the receipt, and decode this contract's events. */
  async sendAndWait(
    target: V2Target,
    method: string,
    args: unknown[],
  ): Promise<{ receipt: TransactionReceipt; events: { name: string; args: Record<string, unknown> }[] }> {
    const { hash } = await this.send(target, method, args);
    const receipt = await this.waitForReceipt(hash);
    if (receipt.status !== 1) throw new Error(`transaction ${hash} failed`);
    const iface = new Interface(this.abis[target]);
    const events = receipt.logs
      .filter((log: Log) => log.address.toLowerCase() === this.addresses[target].toLowerCase())
      .map((log: Log) => {
        try {
          const parsed = iface.parseLog(log);
          return parsed ? { name: parsed.name, args: parsed.args.toObject() } : null;
        } catch {
          return null;
        }
      })
      .filter((e): e is { name: string; args: Record<string, unknown> } => e !== null);
    return { receipt, events };
  }
}
