/**
 * Signing as a custodial holder (ADR-002, ADR-020, ADR-040).
 *
 * v2 moves or burns a card only with its holder's EIP-712 signature. For the
 * custodial wallets Gachard creates at sign-up, Gachard is that holder: it
 * decrypts the key stored in `users.walletPrivateKey` and signs, so the user
 * signs nothing. v1 never decrypted these keys. v2 is their first use.
 *
 * - The decrypt function is passed in rather than imported. Routes pass
 *   `decrypt` from lib/crypto.ts, and tests pass a stub, so this file imports
 *   only `ethers`.
 * - The key is never logged, never returned, and never leaves the Wallet
 *   object.
 * - Plan D5 moves these keys out of MongoDB before mainnet. When that happens,
 *   only `custodialSigner` changes.
 *
 * Sign with `signV2(custodialSigner(user, decrypt), domain, type, value)` from
 * chain-v2.ts.
 */
import { Wallet, type Provider } from "ethers";

export interface CustodialUser {
  walletAddress: string;
  walletPrivateKey: string; // AES-256-GCM, lib/crypto.ts
}

export type Decrypt = (packed: string) => string;

/**
 * A Wallet for the user's custodial address.
 * Refuses if the decrypted key does not belong to the address on record: a
 * signature from the wrong key would be rejected by the contract anyway, but
 * a mismatch here means the record is corrupt and must be looked at.
 */
export function custodialSigner(user: CustodialUser, decrypt: Decrypt, provider?: Provider): Wallet {
  const wallet = new Wallet(decrypt(user.walletPrivateKey), provider);
  if (wallet.address.toLowerCase() !== user.walletAddress.toLowerCase()) {
    throw new Error("custodial key does not match the recorded wallet address");
  }
  return wallet;
}

