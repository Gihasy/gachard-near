/** `CHAIN_VERSION=v2` switches the new store on (docs/PLAN-STORE-V2.md). v1 stays the default until the cutover in phase 6. */
export function v2StoreEnabled(): boolean {
  return process.env.CHAIN_VERSION === "v2";
}
