// End-to-end proof on NEAR testnet, against the deployed contract.
//
// Claim under test: a creator and collectors with no gas money can release,
// receive, move, print and return cards. The platform pays gas and the 1 yocto
// deposit. Their own balances must not change by a single yoctoNEAR.
//
// Run: node --env-file=../frontend/.env.local e2e.mjs
// The platform key comes from that file, which is not in this repository.
// Fresh test accounts are created on each run. Their keys stay in memory.
import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { Account, JsonRpcProvider, KeyPair, actions, teraToGas } from "near-api-js";

const PLATFORM = process.env.NEAR_PLATFORM_ACCOUNT;
const PLATFORM_KEY = process.env.NEAR_PLATFORM_KEY;
if (!PLATFORM || !PLATFORM_KEY) throw new Error("Run with --env-file=../frontend/.env.local");
const CONTRACT = process.env.NEAR_CONTRACT ?? `cards.${PLATFORM}`;
const RPC = process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com";
const EXPLORER = "https://testnet.nearblocks.io/txns/";
const FUNDING = 2_000_000_000_000_000_000_000n; // 0.002 NEAR: storage only, not gas money

const provider = new JsonRpcProvider({ url: RPC });
const platform = new Account(PLATFORM, provider, PLATFORM_KEY);

const steps = [];
let failures = 0;

function check(name, ok, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  steps.push({ name, ok, detail });
}

// A meta transaction reports failure in its receipts, not always at the top.
function failureOf(outcome) {
  const found = [];
  const visit = (status) => {
    if (status?.Failure) found.push(JSON.stringify(status.Failure));
  };
  visit(outcome.status);
  visit(outcome.transaction_outcome?.outcome?.status);
  for (const r of outcome.receipts_outcome ?? []) visit(r.outcome?.status);
  return found.length ? found.join(" | ") : null;
}

function record(name, outcome) {
  const hash = outcome?.transaction?.hash ?? outcome?.transaction_outcome?.id;
  const failure = failureOf(outcome);
  check(name, !failure, failure ? failure.slice(0, 220) : `${EXPLORER}${hash}`);
  return hash;
}

function returned(outcome) {
  for (const r of outcome.receipts_outcome ?? []) {
    const v = r.outcome?.status?.SuccessValue;
    if (v) return JSON.parse(Buffer.from(v, "base64").toString());
  }
  return undefined;
}

const view = (method, args = {}) =>
  provider.callFunction({ contractId: CONTRACT, method, args });

async function balanceOf(accountId) {
  const state = await new Account(accountId, provider).getState();
  return BigInt(state.balance.total);
}

async function newUser(prefix) {
  const keyPair = KeyPair.fromRandom("ed25519");
  // ADR-042: names are an HMAC, never built from an email or a chosen name.
  const label = createHmac("sha256", randomBytes(32)).update(prefix).digest("hex").slice(0, 12);
  const id = `c-${label}.${PLATFORM}`;
  await platform.createSubAccount({
    accountOrPrefix: `c-${label}`,
    publicKey: keyPair.getPublicKey().toString(),
    nearToTransfer: FUNDING,
  });
  return new Account(id, provider, keyPair.toString());
}

// The user signs; the platform submits and pays.
async function relayed(user, method, args, deposit = 0n) {
  const { signedDelegate } = await user.createSignedMetaTransaction({
    receiverId: CONTRACT,
    actions: [actions.functionCall(method, args, teraToGas(60), deposit)],
    blockHeightTtl: 120,
  });
  return platform.relayMetaTransaction(signedDelegate);
}

async function expectRefused(name, wanted, attempt) {
  try {
    const outcome = await attempt();
    const failure = failureOf(outcome);
    check(name, Boolean(failure?.includes(wanted)), failure ? failure.slice(0, 160) : "was NOT refused");
  } catch (error) {
    const message = String(error?.message ?? error);
    check(name, message.includes(wanted), message.slice(0, 160));
  }
}

const printHash = (tokenId, serial) =>
  createHash("sha256").update(`gachard-print:${tokenId}:${serial}`).digest("base64");

async function main() {
  console.log(`Contract ${CONTRACT}\n`);
  const platformBefore = await balanceOf(PLATFORM);

  const creator = await newUser("creator");
  const alice = await newUser("alice");
  const bob = await newUser("bob");
  check("Three accounts created by the platform, no wallet involved", true);
  const users = [creator, alice, bob];
  const before = new Map();
  for (const u of users) before.set(u.accountId, await balanceOf(u.accountId));

  record("Platform approves the creator", await platform.signAndSendTransaction({
    receiverId: CONTRACT,
    actions: [actions.functionCall("approve_creator", { creator: creator.accountId }, teraToGas(30), 0n)],
  }));

  const seriesOutcome = await relayed(creator, "create_series", {
    name: `E2E ${new Date().toISOString().slice(0, 16)}`,
    rates_bps: [7000, 2000, 800, 200],
    prices: [40, 120, 360, 1200],
  });
  record("Creator creates a series, gas paid by the platform", seriesOutcome);
  const seriesId = returned(seriesOutcome);

  const art = readFileSync(new URL("../frontend/public/cards/common-1.webp", import.meta.url));
  const artHash = createHash("sha256").update(art).digest("base64");
  const templateOutcome = await relayed(creator, "add_template", {
    series_id: seriesId,
    name: "Ember",
    rarity: 0,
    media: "cards/common-1.webp",
    media_hash: artHash,
  });
  record("Creator adds a card with its artwork hash", templateOutcome);
  const templateId = returned(templateOutcome);

  const series = await view("get_series", { series_id: seriesId });
  check("Chain names the creator as issuer", series.creator === creator.accountId, series.creator);

  const mintResult = await platform.signAndSendTransaction({
    receiverId: CONTRACT,
    actions: [actions.functionCall("mint", {
      series_id: seriesId, template_ids: [templateId], receiver_id: alice.accountId,
    }, teraToGas(60), 0n)],
  });
  record("Platform mints a card to Alice", mintResult);
  const tokenId = returned(mintResult)[0];

  let card = await view("get_card", { token_id: tokenId });
  check("Card records its origin", card.creator === creator.accountId && card.series_id === seriesId,
    `token ${tokenId}, series ${card.series_id}, template ${card.template_id}`);
  check("Stored art hash matches the file",
    (await view("get_template", { series_id: seriesId, template_id: templateId })).media_hash === artHash);

  await expectRefused("Platform cannot move Alice's card", "Only the holder can transfer", () =>
    platform.signAndSendTransaction({
      receiverId: CONTRACT,
      throwOnFailure: false,
      actions: [actions.functionCall("mt_transfer", {
        receiver_id: bob.accountId, token_id: tokenId, amount: "1",
      }, teraToGas(30), 1n)],
    }));

  record("Alice sends the card to Bob, with no NEAR of her own",
    await relayed(alice, "mt_transfer", { receiver_id: bob.accountId, token_id: tokenId, amount: "1" }, 1n));
  card = await view("get_card", { token_id: tokenId });
  check("Bob now holds it", card.owner_id === bob.accountId);

  const serial = randomBytes(16).toString("hex");
  record("Bob prints the card",
    await relayed(bob, "print_lock", { token_id: tokenId, print_hash: printHash(tokenId, serial) }, 1n));
  card = await view("get_card", { token_id: tokenId });
  check("Card reads Printed, still held by Bob", card.status === "Printed" && card.owner_id === bob.accountId);
  check("Its QR reads as the current print", (await view("print_state", { token_id: tokenId, serial })) === "Active");
  check("A made-up QR reads as unknown", (await view("print_state", { token_id: tokenId, serial: "made-up" })) === "Unknown");

  await expectRefused("Someone with the paper but not the account cannot move it", "Only the holder can transfer", () =>
    relayed(alice, "mt_transfer", { receiver_id: creator.accountId, token_id: tokenId, amount: "1" }, 1n));
  await expectRefused("Someone with the paper but not the account cannot return it", "Only the holder can return", () =>
    relayed(alice, "request_return", { token_id: tokenId }, 1n));
  await expectRefused("The platform cannot return a card nobody asked to return", "Card is not being returned", () =>
    platform.signAndSendTransaction({
      receiverId: CONTRACT,
      throwOnFailure: false,
      actions: [actions.functionCall("confirm_return", { token_id: tokenId }, teraToGas(30), 0n)],
    }));

  record("Bob transfers the printed card to Alice",
    await relayed(bob, "mt_transfer", { receiver_id: alice.accountId, token_id: tokenId, amount: "1" }, 1n));
  card = await view("get_card", { token_id: tokenId });
  check("Alice holds it, and it is still printed", card.status === "Printed" && card.owner_id === alice.accountId);

  record("Alice asks to return it", await relayed(alice, "request_return", { token_id: tokenId }, 1n));
  await expectRefused("A card on its way back cannot move", "Card is being returned", () =>
    relayed(alice, "mt_transfer", { receiver_id: bob.accountId, token_id: tokenId, amount: "1" }, 1n));
  await expectRefused("The holder cannot confirm their own return", "Only the minter can answer", () =>
    relayed(alice, "confirm_return", { token_id: tokenId }));

  record("The platform confirms the physical card arrived", await platform.signAndSendTransaction({
    receiverId: CONTRACT,
    actions: [actions.functionCall("confirm_return", { token_id: tokenId }, teraToGas(30), 0n)],
  }));
  card = await view("get_card", { token_id: tokenId });
  check("Same token, digital again, still held by Alice",
    card.token_id === tokenId && card.status === "Digital" && card.owner_id === alice.accountId);
  check("The old QR now reads as void", (await view("print_state", { token_id: tokenId, serial })) === "Void");
  check("History shows the whole trip",
    card.history.map((h) => h.kind).join(">") === "Mint>Transfer>Print>Transfer>ReturnRequested>Returned",
    card.history.map((h) => h.kind).join(" > "));

  console.log("");
  // Nobody pays. A refused call's 1 yocto deposit, which the platform attached,
  // is refunded to the user who signed it, so the exact gain is the number of
  // refused calls above that carried one: Alice three. Exact, so a real charge cannot hide.
  const refundsExpected = new Map([[creator.accountId, 0n], [alice.accountId, 3n], [bob.accountId, 0n]]);
  for (const u of users) {
    const after = await balanceOf(u.accountId);
    const gain = after - before.get(u.accountId);
    check(`${u.accountId.split(".")[0]} paid nothing`, gain === refundsExpected.get(u.accountId),
      `balance change ${gain} yocto, expected ${refundsExpected.get(u.accountId)}`);
  }
  const spent = platformBefore - (await balanceOf(PLATFORM));
  console.log(`\nPlatform spent ${(Number(spent) / 1e24).toFixed(6)} NEAR, including ${(Number(FUNDING * 3n) / 1e24).toFixed(3)} funding the three accounts.`);

  writeFileSync(new URL("./last-run.json", import.meta.url), JSON.stringify({
    ranAt: new Date().toISOString(),
    contract: CONTRACT,
    tokenId,
    seriesId,
    failures,
    steps,
  }, null, 2));
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error("Run stopped:", error);
  process.exit(2);
});
