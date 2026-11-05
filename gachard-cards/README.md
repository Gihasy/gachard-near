# gachard-cards

A NEP-245 multi token contract for creator-released TCG cards. Each card is its
own token id with a supply of 1. It records who released the card, what it is
(with a sha256 of the artwork), who holds it, whether it is locked for print,
and its recent history.

Who can do what:

| Action | Who | Note |
|---|---|---|
| Move a card, lock it for print | The holder only | The platform has no method that moves a card |
| Create a series, add a card | An approved creator's own account | Templates cannot be changed once added |
| Mint | The minter (the platform) | Can mint any amount from any template |
| Redeem a printed card | Whoever holds the code | The card moves to the caller |

Limits worth knowing:

- "Released by this creator" means the creator's account published the template.
  It does not prove they own the IP, and it does not mean they approved each mint.
- History in the contract keeps the most recent 32 entries and a true total.
  The full record is in the NEP-245 events.
- A redeem code is visible on chain once used. It is dead by then, because the
  print cycle has moved on.

## Build and test

```bash
cargo test
```

```bash
cargo near build non-reproducible-wasm --no-abi
```

`--no-abi` is needed on Windows, where the ABI step fails to link. Output is
`target/near/gachard_cards.wasm`.

The end-to-end check against testnet is in [`../near-e2e`](../near-e2e).
