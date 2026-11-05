/**
 * Plays Pyth on a local anvil chain: answers every rotation's seed request,
 * so /store gets past "Preparing the store…" in local development.
 *
 *   cd frontend && node scripts/v2-local-keeper.mjs [rpcUrl]
 *
 * Reads the addresses from contracts/deployments/local-v2.json (LocalDevV2).
 * Signs with anvil's public development key 0, the MockEntropy provider.
 * On testnet and mainnet Pyth does this itself; never point it anywhere else.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Contract, Interface, JsonRpcProvider, Wallet, hexlify, randomBytes } from "ethers";
import { STORE_ABI } from "../lib/v2/relayer.ts";

const here = dirname(fileURLToPath(import.meta.url));
const RPC = process.argv[2] ?? "http://127.0.0.1:8545";
const PROVIDER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // anvil 0

const addresses = JSON.parse(readFileSync(resolve(here, "../../contracts/deployments/local-v2.json"), "utf8"));
const provider = new JsonRpcProvider(RPC, undefined, { staticNetwork: true });
if ((await provider.getNetwork()).chainId !== 31337n) throw new Error("not anvil (chain id 31337): refusing to run");

const signer = new Wallet(PROVIDER_KEY, provider);
const entropy = new Contract(
  addresses.entropy,
  ["function mockReveal(address provider, uint64 sequenceNumber, bytes32 randomNumber)"],
  signer,
);
const store = new Interface(STORE_ABI);
const requested = store.getEvent("RotationEntropyRequested");

let from = await provider.getBlockNumber();
console.log(`keeper: watching ${addresses.store} on ${RPC} from block ${from}`);
for (;;) {
  const to = await provider.getBlockNumber();
  if (to >= from) {
    const logs = await provider.getLogs({ address: addresses.store, topics: [requested.topicHash], fromBlock: from, toBlock: to });
    for (const log of logs) {
      const { rotationId, sequence } = store.parseLog(log).args;
      await (await entropy.mockReveal(signer.address, sequence, hexlify(randomBytes(32)))).wait();
      console.log(`keeper: seeded rotation ${rotationId} (sequence ${sequence})`);
    }
    from = to + 1;
  }
  await new Promise((r) => setTimeout(r, 1000));
}
