// One command for a clean machine: creates a throwaway testnet account from the
// public faucet, deploys the contract from the committed wasm, and writes
// .env.local. No account, key or funds are needed from whoever runs it.
// If .env.local already exists, nothing is changed.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Account, JsonRpcProvider, KeyPair, actions, nearToYocto, teraToGas } from "near-api-js";

const ENV_FILE = new URL("../.env.local", import.meta.url);
const WASM = new URL("../../gachard-cards/res/gachard_cards.wasm", import.meta.url);
const RPC = "https://test.rpc.fastnear.com";
const FAUCET = "https://helper.nearprotocol.com/account";

if (existsSync(ENV_FILE)) {
  console.log("Setup: .env.local exists, keeping it.");
  process.exit(0);
}

const keyPair = KeyPair.fromRandom("ed25519");
const publicKey = keyPair.getPublicKey().toString();
const platformId = `gachard-demo-${randomBytes(4).toString("hex")}.testnet`;
const contractId = `cards.${platformId}`;

console.log(`Setup: creating ${platformId} from the testnet faucet...`);
const response = await fetch(FAUCET, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ newAccountId: platformId, newAccountPublicKey: publicKey }),
});
if (!response.ok) {
  throw new Error(`The testnet faucet answered ${response.status}. Wait a minute and run this again.`);
}

const provider = new JsonRpcProvider({ url: RPC });
const key = keyPair.toString();
const platform = new Account(platformId, provider, key);

// A new account or key can take a moment to reach the RPC node. Signing then fails
// before anything is sent, so it is safe to try again.
async function whenKeyArrives(send) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await send();
    } catch (error) {
      const message = `${error?.name ?? ""} ${error?.message ?? error}`;
      const notYet = /AccessKeyDoesNotExist|Access key .* does not exist|AccountDoesNotExist|does not exist while viewing/i.test(message);
      if (attempt >= 20 || !notYet) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
}

console.log(`Setup: deploying the contract to ${contractId}...`);
await whenKeyArrives(() =>
  platform.createSubAccount({
    accountOrPrefix: "cards",
    publicKey,
    nearToTransfer: nearToYocto("4"),
  }),
);
const contract = new Account(contractId, provider, key);
await whenKeyArrives(() =>
  contract.signAndSendTransaction({
    receiverId: contractId,
    actions: [
      actions.deployContract(new Uint8Array(readFileSync(WASM))),
      actions.functionCall("new", { owner: platformId, minter: platformId }, teraToGas(30), 0n),
    ],
  }),
);

writeFileSync(
  ENV_FILE,
  [
    `NEAR_PLATFORM_ACCOUNT=${platformId}`,
    `NEAR_PLATFORM_KEY=${key}`,
    `NEAR_CONTRACT=${contractId}`,
    `NEAR_RPC_URL=${RPC}`,
    `ENCRYPTION_SECRET_KEY=${randomBytes(32).toString("hex")}`,
    "ENABLE_DEMO_LOGIN=true",
    "",
  ].join("\n"),
);
console.log("Setup: done, .env.local written.");
