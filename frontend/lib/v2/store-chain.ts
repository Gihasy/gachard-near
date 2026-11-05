/**
 * The store's chain port (store-service.ts) on GachardStore, through the
 * relayer.
 *
 * - **Commit and entropy wait for their receipts.** The entropy request
 *   simulates against the latest block, so it must see the commit mined, and
 *   a rotation whose request failed must not be recorded as requested: the
 *   store would wait for a seed that never comes.
 * - **Repeats are success once the chain confirms them.** When two first
 *   visitors race, or a request timed out after its transaction landed, the
 *   second attempt reverts with AlreadyCommitted, EntropyAlreadyRequested or
 *   AlreadyRevealed. Each is treated as done only after reading the rotation
 *   back, and a commit is done only if the stored hash is this secret's.
 *
 * ADR-018 caps a route at 10 seconds, so each wait is bounded. A wait that
 * runs out throws, and the next store request finds the transaction landed.
 *
 * Imports only `ethers` through the relayer, so tests can load it.
 */
import { ZeroHash } from "ethers";
import { isAlreadyDone, type V2Relayer } from "./relayer.ts";
import type { StoreChain } from "./store-service.ts";

const RECEIPT_TIMEOUT_MS = 4_000;

interface OnChainRotation {
  secretHash: string;
  seed: string;
  seedRequested: boolean;
  revealed: boolean;
}

export function relayerStoreChain(relayer: V2Relayer): StoreChain {
  const read = (rotationId: number) => relayer.read<OnChainRotation>("store", "rotation", [rotationId]);

  /** Send, wait for the receipt, and turn a confirmed repeat into "already". */
  async function confirmed(method: string, args: unknown[], done: () => Promise<boolean>): Promise<string> {
    try {
      const { hash } = await relayer.send("store", method, args);
      const receipt = await relayer.waitForReceipt(hash, RECEIPT_TIMEOUT_MS);
      if (receipt.status === 1) return hash;
      if (await done()) return "already"; // a racing transaction landed first
      throw new Error(`${method} reverted in ${hash}`);
    } catch (err) {
      if (isAlreadyDone(err) && (await done())) return "already";
      throw err;
    }
  }

  return {
    commitRotation(rotationId, secretHash, endsAt, revealAfter) {
      return confirmed("commitRotation", [rotationId, secretHash, endsAt, revealAfter], async () => {
        const stored = (await read(rotationId)).secretHash;
        if (stored === ZeroHash) return false;
        // Another secret on chain for this rotation means the database and the chain disagree.
        if (stored.toLowerCase() !== secretHash.toLowerCase()) {
          throw new Error(`rotation ${rotationId} is committed with a different secret`);
        }
        return true;
      });
    },

    requestEntropy(rotationId) {
      return confirmed("requestRotationEntropy", [rotationId], async () => (await read(rotationId)).seedRequested);
    },

    async readSeed(rotationId) {
      const seed = (await read(rotationId)).seed;
      return seed === ZeroHash ? null : seed;
    },

    revealRotation(rotationId, secret) {
      return confirmed("revealRotation", [rotationId, secret], async () => (await read(rotationId)).revealed);
    },
  };
}
