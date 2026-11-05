# Next contract specification (v2)

**Status**: proposed with ADR-040, 15 October 2026. A first Solidity draft
is in `contracts/src/v2/`, with 88 tests in `contracts/test/v2/`, invariant tests
included. It is not deployed and not audited. The deployed contracts are still
`GachardCard` (`0x2a05a2e3…74c9d08`) and `PackEntropy` (`0x6B53C35e…21764542`)
on Monad Testnet.

This document gathers everything the next contract has to carry:
- ADR-033: a `setURI`;
- ADR-036: holder-signed transfers, roles, timelock, rate limits, a guardian;
- ADR-038: limited supply, album lock, Completion card, one entropy request
  per rotation;
- ADR-039: `seriesId` and `templateId`.

It then decides how they fit together. Section 18 lists what is still open.

## 1. Goals, in priority order

1. **No single key can take or destroy a card someone holds.** Moving or
   burning a card needs the holder's signature.
2. **Every leaked key does bounded damage, for a bounded time.** Limits per
   time window, a fast pause, and roles split so each key carries only what
   its job needs.
3. **The everyday path stays free and quick for users.** Gas stays sponsored
   (ADR-003), requests stay asynchronous (ADR-018), and a custodial user signs
   nothing.
4. **The platform grows without redeploying the card ledger.** Logic lives in
   modules that can be swapped. The numbers that need to grow are parameters.
5. **Every claim can be checked by anyone**: store fairness, limited supply,
   album rewards.

## 2. What the deployed contracts get wrong

Read from `contracts/src/GachardCard.sol` and `PackEntropy.sol`, not from the
ADRs.

| Finding | Where | v2 answer |
|---|---|---|
| The owner key can move any Digital card, including cards in a user's own wallet | `marketplaceTransfer`, no holder signature (ADR-036) | Holder-signed transfers only (§6) |
| The owner key can burn any Digital card | `burnCard` | Holder-signed burn, capped (§6, §9) |
| Unlimited minting; `setAuthorizedMinter` hands minting to anyone | `mintBatch`, `setAuthorizedMinter` | Minting only through modules, capped, with roles granted through the timelock |
| `redeemCard` compares the argument to `storedHash`, which is public | `storedHash` is `public` (ADR-036) | The contract checks the code itself, not its hash (§8) |
| One owner key does everything, and it is the hot key | `Ownable`, five `onlyOwner` functions on the request path | Roles with an asymmetric split (§4) |
| No templates, series, limited supply, album lock or soulbound card | not modelled | Template registry, kinds and statuses (§5) |
| One entropy request per pack, with the seed public before the store is used | `PackEntropy` | One request per rotation, plus a server-secret commit-reveal (§7) |
| `uri()` is empty and cannot be changed | `ERC1155("")`, no setter (ADR-033) | `setURI` through the timelock; it stays empty until decided |
| No pause | — | Guardian pause of the privileged paths (§10) |
| `recordVerification` writes storage that nothing on chain reads | `lastRiskScore`, `flaggedSuspicious` | An event only. Nothing on chain reads these values, and an event records the same facts for far less gas |
| Anyone can rewrite `lastOwner` for any Digital card | The `_update` override sets `lastOwner` on every transfer, including a zero-value one that anyone may send. Nothing in the app reads it: `getLastOwner` has no caller, and Scan reads MongoDB | Every amount must be exactly 1. A zero-value transfer reverts, so `holderOf` changes only when a card really moves |

Two documents disagree with the code. The code is the fact:
- **ADR-004** says `requestPrint()` moves the token to the contract. It does
  not. It only sets `cardStatus = Vaulted`, and the token stays in the holder's
  wallet ("Kartu TETAP di wallet user" in the source). v2 keeps the code's
  behaviour: a card is locked in place.
- **`frontend/lib/redeem-code.ts`** says the code is hashed with "keccak256 so
  it matches Solidity". It actually uses Node's `sha3-256`, which is NIST
  SHA3-256, a different function from Ethereum's `keccak256`. v1 never notices,
  because both sides of the comparison come from the same function off chain.
  v2 verifies on chain, so it must use `keccak256` (§8).

## 3. Architecture

```
Safe multisig (2-of-3, hardware keys)
   │ proposes, and can cancel
   ▼
TimelockController (48 h)  ──  admin of every contract below
Guardian (cold hardware key) ── pause, lower limits, revoke hot roles: instant
Relayer(s) (hot, in a signer service) ── submit the everyday transactions
Attestor (KMS key, separate environment) ── co-signs value-creating actions   [decision D3]

GachardCards   ERC-1155 ledger. Immutable, no proxy. Who holds what, and the rules for moving it.
GachardStore   Rotations, entropy, commit-reveal, purchases. A module: replaceable.
GachardAlbums  Seasons, album placement, Wish Cards, rewards. A module: replaceable.
```

- **The ledger is the only thing users have to trust forever.** It stays
  small and never changes.
- **Modules** get roles on the ledger (`MINTER_ROLE`, `STATUS_ROLE`).
  Replacing a module means deploying the new one, granting it the roles
  through the timelock, then revoking the old one. Cards never move.
- **No upgradeable proxy on the ledger.** Whoever holds the upgrade right can
  rewrite who owns what, which is the largest power there is. ADR-036 exists to
  shrink powers like that, not to add one. A module may use a proxy if it ever
  needs one, behind the same Safe and timelock.

## 4. Roles and keys

**Principle: anything that reduces risk is fast; anything that increases it is
slow.**

| Role | Held by | Can | Cannot | If it leaks |
|---|---|---|---|---|
| Admin (`DEFAULT_ADMIN_ROLE`) | TimelockController, proposed by the Safe | Grant roles, raise limits, register templates and seasons, `setURI` | Act in under 48 h | Needs 2 of 3 signers. Every queued action alerts all signers, who can cancel it |
| Guardian | Cold hardware key, not on any server | Pause; lower any limit; revoke Relayer and module roles at once; cancel a queued timelock action | Grant anything, unpause, raise a limit, propose or execute an admin action | Can stop the platform. Cannot take anything |
| Unpauser | The Safe directly, no timelock | Unpause | Anything else | Needs 2 of 3 signers |
| Relayer | Hot keys in a signer service | Submit holder-signed actions, purchases and redeems; commit and reveal rotation secrets | Move or burn a card without the holder's signature; exceed a limit | Capped mints of tokens Gachard never admits (ADR-036), and entropy spend |
| Attestor `[D3]` | KMS key in a separate environment | Co-sign purchases, Wish Cards and rewards | Submit anything on its own | Nothing, alone |
| `MINTER_ROLE`, `STATUS_ROLE` | Module contracts only, never a person's key | What each module's code allows | Anything outside that code | Only through a bug in the module, which the Guardian pause covers |

- **Roles are enumerable** (`AccessControlEnumerable`). ADR-036 found that v1's
  `authorizedMinters` cannot be listed cheaply on this RPC. Now anyone can list
  who holds what in one call.
- **Granting is slow and revoking is fast.** If a Relayer key leaks, the
  Guardian revokes it in one transaction, and the Safe grants a new key
  through the timelock. The platform keeps running on the other Relayer keys,
  which is the reason to run more than one.

## 5. Token model

- **One `tokenId` per card**, sequential (ADR-001, ADR-036's supply check).
- **Per card, packed into one storage slot**:
  - `templateId` (`uint32`);
  - `status` (`uint8`);
  - `printCycle` (`uint32`);
  - `serial` (`uint32`), the Completion number;
  - `mintedAt` (`uint40`).
- **Template registry**, keyed by `templateId`:
  - `seriesId`, `rarity`, `kind`;
  - `maxSupply`, split into `albumCap` and `storeCap`;
  - counters `albumMinted` and `storeMinted`.

  Templates are registered through the timelock before a season launches, and
  are frozen once it is Live (ADR-039 §"Once Live"). A creator's Series is
  scheduled days ahead anyway, so the 48-hour delay costs nothing.
- **Kinds**:
  - **Standard**: album and shelf cards.
  - **Limited**: has a `maxSupply`, and is never burned.
  - **Completion**: soulbound, numbered.
- **Statuses**:
  - **Digital**.
  - **PrintLocked**: v1's `Vaulted`.
  - **AlbumLocked**: permanent.

What each combination allows, enforced in `_update` so that **every** path
obeys it, including a holder's own `safeTransferFrom`:

| Card | Transfer | Burn (dismantle) | Print | Place in album |
|---|---|---|---|---|
| Standard, Digital | yes | yes | yes | yes, into its own slot |
| Limited, Digital | yes | **no** (ADR-038: "not dismantlable") | yes | no |
| Completion | **never** | **never** | **never** | — |
| Any card, PrintLocked | only by redeem | no | no | no |
| Any card, AlbumLocked | **never** | **never** | **never** | already placed |

## 6. Actions, and who has to agree to each

| Action | Sent by | Authorised by | Limit | Notes |
|---|---|---|---|---|
| Buy a pack or shelf (mint) | Relayer → Store | Attestor `[D3]`; a unique `purchaseId` | mint | At most 25 cards, the whole shelf with Expansion |
| Transfer: Trade sale, export | Relayer → ledger | Holder, EIP-712 `TransferBatch` | transfer | Replaces `marketplaceTransfer`. Self-custody holders may also call `safeTransferFrom` themselves |
| Dismantle (burn) | Relayer → ledger | Holder, `BurnBatch` | burn | Standard cards only |
| Request a print | Relayer → ledger | Holder, `PrintRequest` carrying the code commitment | — | `printCycle` +1; status becomes PrintLocked |
| Cancel a print before it ships | Relayer → ledger | Holder, `PrintCancel` | — | Back to Digital, same holder |
| Redeem a physical card | Relayer → ledger | The scratch code itself | redeem | Goes to the redeeming account (ADR-007, bearer code) |
| Place in album | Relayer → Albums | Holder, `AlbumPlace` | — | Permanent |
| Wish Card into album | Relayer → Albums | Holder, plus Attestor `[D3]` | wish | Mints straight into the slot, AlbumLocked; never Limited |
| Album rewards | Relayer → Albums | The on-chain completion check | reward | Completion card always; Limited while the album share lasts; one per address per season |
| Rotation commit and reveal | Relayer → Store | — | — | §7 |

**Signatures**:
- **EIP-712**, with a domain of name, version, `chainId` and the contract
  address. A signature cannot be replayed on another chain or contract.
- **Unordered nonces**: each nonce is used once, in any order. Several
  requests can be in flight at the same time (ADR-018).
- **A deadline of at most one hour.**
- **Only a Relayer can submit a signed action.** A signature phished from a
  self-custody user is useless outside Gachard's relayer, which checks the
  intent against the user's session first.
- **Checked as ECDSA first, then ERC-1271.** OpenZeppelin 5.6.1's
  `SignatureChecker.isValidSignatureNow` skips ECDSA whenever the signer has
  code, and Privy's sponsored wallets carry EIP-7702 delegation code
  (ADR-031). Using it as is would reject every self-custody user. Accepting
  ECDSA from an address with code is safe: a contract wallet has no private key
  that could produce its address.

**For custodial users**, the backend signs as the holder with the custodial
key (ADR-020), so the user still signs nothing. The gain is that the Relayer
key alone no longer moves cards. Taking a card now needs the custodial key as
well, which ADR-036 already counts as custody.

## 7. Store fairness: commit-reveal per rotation

This closes the gap found on 14 October 2026, which ADR-038 has not recorded
yet. With a public seed, anyone could compute every user's store before
revealing a single card. That makes Detection free and the reveal pointless.

1. **Before the rotation**, the Relayer calls `commitRotation(r, keccak256(secret_r))`.
2. **Then** it requests Pyth Entropy for rotation `r`, once per six hours for
   the whole platform. The secret was committed before the seed existed, so
   the server cannot pick a secret to suit the seed.
3. **During the rotation**, each user's store is
   `derive(seed_r, secret_r, holderAddress)`, off chain (ADR-029 Opsi B).
   Nobody outside the server can compute it, because `secret_r` is unknown.
4. **The API sends one card at a time**, only when it is revealed. A pack's
   full contents never reach the browser early, where devtools could read them.
5. **Each purchase** records `rotationId`, `purchaseId` and a hash of the cards
   bought.
6. **After the rotation**, the Relayer calls `revealRotation(r, secret_r)`. The
   contract checks the secret against the commitment. Anyone can then
   recompute any store and check that every purchase came from it.
7. **A reveal more than 24 hours late is visible on chain**
   (`rotationOverdue(r)`), and monitoring alerts on it.

**Proven**:
- the store was fixed before the rotation began;
- the server could not steer it after seeing the seed;
- every purchase matches the store it came from.

**Not proven**: that the derivation algorithm is unbiased. That is the same
known limitation as ADR-029, and for the same reason: an on-chain derivation
costs too much gas.

**Replacement packs** (ADR-038 amendment, 15 October 2026). Each slot has a
queue: the opening pack, then at most two replacements that appear as packs
are bought.
- **The whole queue is derived at rotation start** from the same seed, secret
  and holder (`derivePack(slot, depth)`).
- **A purchase uncovers the next pack; it never draws one.** The queue is
  verified after the reveal exactly like the opening shelf.

**Limited cards in stores** follow the daily pacing of ADR-038. The server
turns the remaining share into a per-card chance, and `derivePack` applies it:
- only in base slots, never in Expansion slots;
- in replacement packs only while the season's `limitedInRefills` is on (the
  default).

**The chance is in parts per million**, fixed when the rotation is committed
and stored with it (`limitedChancePpm`), so a verifier after the reveal uses
the exact number. Basis points, the first unit, were too coarse: Season 0's
store share of 5 cards over 90 days is under one basis point per card, which
rounded to zero and would have held every limited card back to the last days
of the season (found while building phase 1, 15 October 2026).

On chain, `storeMinted ≤ storeCap` is enforced, so no derivation can exceed
the store share.

## 8. Redeem codes

- **Strength**: the code today is `randomBytes(12)` as base64url, 16
  characters and 96 bits. Nobody can guess that. But base64url mixes upper and
  lower case with `-` and `_`, which is hard to read off a scratch panel.
  **Proposal `[D4]`**: 16 characters of Crockford base32, which is upper case
  with no 0/O or 1/I confusion. That is 80 bits, printed as four groups of four.
- **The redeem screen in `design/gachard.pen` shows 8 boxes**, which would be
  40 bits. Against the public commitment, 40 bits can be brute-forced on one
  GPU in minutes. The design must follow the code here, not the other way round.
- **On chain**:
  - `PrintRequest` stores
    `commit = keccak256(abi.encode(tokenId, printCycle, code))`.
  - `redeem(tokenId, code, recipient)` recomputes it.
  - The code is consumed by that call, so seeing it in the transaction
    afterwards gives nothing away.
  - Only a Relayer can call it, so nobody can race it.
- **Off chain**, the code is hashed with `keccak256` (ethers), **not**
  `sha3-256` (§2). The rate limit of five attempts a minute stays (ADR-006,
  ADR-019).

## 9. Limits that grow with the platform

Every limit is a **parameter**, not a constant:
- **Raising** a limit goes through the timelock (48 h).
- **Lowering** one is instant, through the Guardian.
- A limit exists to bound what a leaked key can do before anyone notices. It
  does not exist to cap the business.

| Action | Window | How it is set |
|---|---|---|
| Mint | per hour | 3–5× the busiest hour |
| Burn (dismantle) | per hour | the same. **The one that matters most**: a burn destroys a real card, while a rogue mint is never admitted (ADR-036) |
| Transfer by Relayer | per hour | the same |
| Redeem | per hour | the same |
| Wish into album, album rewards | per hour | the same |

- **Buckets per Relayer key.** If one key leaks, the damage is that key's
  share.
- **Monitoring alerts at 60–70% of a limit**, so it can be raised through the
  timelock long before it binds.
- **Hourly rather than daily windows** once there is 24-hour monitoring. The
  throughput is the same, and the most that can go wrong in one window is
  smaller.
- **When a limit is reached, nothing fails.** Purchases are still accepted and
  wait as "Processing", a status that already exists, until the next window.
- **Limited `maxSupply` is not a rate limit.** It never rises.

## 10. Pause

- **Scope `[D2]`**: the privileged paths only, meaning mint, Relayer
  transfers, burn, print, redeem, album actions and rewards. **A holder's own
  transfer of a Digital card is never paused.** Pausing it would be the
  "freeze everyone" power that §11 rejects, and it would break ADR-031's
  self-custody promise.
- **The Guardian pauses; the Safe unpauses**, with two signers and no
  timelock, so a false alarm costs minutes, not two days.

## 11. Theft: a platform hold, not a contract freeze

**Decided 15 October 2026.** A stolen card or a taken-over account is held
**in the platform** (MongoDB and the API), not frozen in the contract.

Why not in the contract:
1. **A freeze power is a new weapon for whoever steals a key.** It could
   freeze every card at once, to ransom the platform or just to stop it.
2. **It would break ADR-031's promise** that Gachard cannot touch a card held
   in the user's own wallet.
3. **Freezing the wrong card is likely.** An innocent buyer is caught along
   with the thief, which needs an appeal process and carries legal exposure.
4. **The gain is small.** Outside Gachard a card has no name or image
   (ADR-033), so there is nothing to sell it for. The only place a thief can
   profit is inside Gachard, and the platform hold covers that completely.

Why the hold is enough:
- **Every action starts from the card's document** in MongoDB (ADR-036), so a
  `hold` flag on the card or the account blocks all of them at once:
  - Trade listing and buying;
  - dismantle;
  - print and redeem;
  - export;
  - album placement.
- **A held card that was exported is refused at import**, by any account. It
  cannot be laundered back in.
- **Scan shows "On hold"**, with no chain words (ADR-002, design principle 06).

The flows:

| Case | Response |
|---|---|
| **Google account taken over** | Card and account holds. Sessions revoked. Cards still in custody can be returned to the owner by a custodial transfer, which Gachard is entitled to sign because it holds that key |
| **Physical card stolen**, reported before it is scratched | That card's redeem is refused while it is held. If needed, a reprint starts a new `printCycle`, which retires the stolen code (ADR-005) |
| **Self-custody wallet compromised** (Privy) | Gachard cannot move that card; that is what self-custody means. The card is refused at import and held in every Gachard surface |

**Platform hygiene that prevents most theft in the first place**, all off chain:
- **A 24–72 h cooldown** on export, print and redeem of high-value cards after
  a sign-in from a new device or a change of email.
- **A notification** for every export and listing.
- **The existing risk check** on Trade purchases.

## 12. Growth and change

- **New features are new modules.** Store v2 or a new reward type ships
  without touching the ledger or moving a card.
- **Metadata**: `setURI` exists, admin only, through the timelock. It stays
  empty until ADR-033 is revisited. Turning it on is a decision, not a code
  change.
- **Royalties `[D6]`**: an ERC-2981 slot, set to 0%, for the self-custody
  marketplace fee in ADR-034. Marketplaces may ignore it, so it is a courtesy,
  not enforcement.
- **Parameters** (limits, rotation timing) change without a deploy, under the
  asymmetric delays of §4.
- **Creators' games read cards; they never write them** (decided 15 October
  2026, ADR-039 amendment). A game sees a player's cards of its own Series
  through a Gachard API, after the player connects their account and consents.
  No game is ever given a role on any contract, so this needs nothing from the
  contract beyond `seriesId` and `templateId` on each card.

## 13. Ease of use and operations

- **Custodial users sign nothing and pay nothing.** Self-custody users sign
  once per batch in Privy, as export already does (`ExportBatch`).
- **Batches**:
  - a shelf mint, up to 25 cards;
  - a dismantle of many cards;
  - album placements;
  - transfers, one signature per batch.
- **Retries are safe by construction.** `purchaseId` and the signature nonces
  make a second submission revert instead of running twice. That retires the
  hazard in ADR-031: the RPC's "could not coalesce" error after a write that
  had in fact landed.
- **Custom errors** instead of revert strings. They cost less gas and are
  easier to map to user messages.
- **Events** are the audit trail. MongoDB stays the source of truth for the
  app, and the admission rule of ADR-036 is unchanged.

## 14. Keys and infrastructure

- **The weakness ADR-036 names**: the hot key and the database live in the same
  Vercel environment. **Proposal `[D5]`**:
  - Relayer signing moves to a signer service backed by a cloud KMS.
  - Custodial keys move out of MongoDB into KMS-wrapped storage, or to Privy
    server wallets.
  - Then a database leak and a key leak are no longer the same event.
- **The Safe's three keys** are hardware wallets. One is stored offline. The
  recovery procedure is written down.
- **Rotating a Relayer key needs no redeploy**: grant the new key, then revoke
  the old one.

**Key inventory** (decided 15 October 2026). v2 has no single admin wallet,
and **the v1 admin key gets no role in v2**. That key has lived in the same
environment as the database (ADR-036), and the runbook's rule is never to hand
power back to a key that may have been exposed.

| Key | Job | Kept in | Created |
|---|---|---|---|
| Safe, 2-of-3 | Proposes to the timelock; unpauses | Two hardware wallets plus an offline backup in another place (D1) | Before the testnet deploy |
| Guardian | Pause, lower limits, revoke hot roles, cancel queued admin actions | A separate account on one of the hardware wallets, not a Safe signer address | Before the testnet deploy |
| Deployer | Deploys, hands every role over, keeps none | A fresh single-use key | At deploy |
| Relayer × 2 | Everyday transactions; two, so one can be revoked without stopping the platform | Testnet: environment variable. Mainnet: KMS (D5) | At deploy |
| Attestor | Co-signs purchases, Wish Cards, rewards | KMS in a separate cloud account (D3) | Before mainnet |
| v1 admin | Stays owner of v1 until retirement, then hands ownership to a burn address (§17) | Unchanged | — |

Safe is listed as supported on Monad testnet and mainnet in Monad's own
documentation (docs.monad.xyz, "Multisig wallets", checked 15 October 2026).

## 15. Monitoring (ADR-037)

Alerts on:
- **any timelock proposal**, so every signer sees it at once;
- **any role grant or revoke**;
- **pause and unpause**;
- **limits at 60% and at 90%**;
- **the supply check**: the highest `tokenId` Gachard acknowledges against the
  chain (exists today, ADR-036);
- **burns and exports** well above the usual rate;
- **listings far below fair value (FVM)**;
- **an overdue rotation reveal**;
- **Relayer gas and entropy balances**.

## 16. Testing, audit and launch

1. **Unit tests in Foundry** for every function and every revert path.
2. **Invariant tests**, run against random call sequences:
   - minted per template ≤ `maxSupply`;
   - `storeMinted ≤ storeCap` and `albumMinted ≤ albumCap`;
   - an AlbumLocked or Completion card never changes holder;
   - a Limited card is never burned;
   - no card moves without a holder signature, a redeem code or a mint;
   - no window ever exceeds its limit;
   - a used nonce or `purchaseId` never runs twice.
3. **Fuzzing**, Slither static analysis and gas snapshots.
4. **Fork tests against Monad Testnet**, including a Privy wallet with EIP-7702
   code signing a `TransferBatch`.
5. **Deployment and post-deploy check scripts.** The second reads every role
   and parameter back and fails if any differs from the plan. Source verified
   on Sourcify.
6. **Two to four weeks on testnet**, including the incident drill in
   `docs/INCIDENT-RUNBOOK-V2.md` (written 15 October 2026; v1 keeps
   `docs/INCIDENT-RUNBOOK.md` while it lives).
7. **External audit before mainnet**, then a bug bounty.

**Static analysis, 15 October 2026.** Slither 0.11.6 on `contracts/src/v2/`
reports no exploitable finding. Each result was triaged:

| Finding | Where | Verdict |
|---|---|---|
| arbitrary-send-eth (High) | `GachardStore.withdraw` | By design. Admin only, so through the 48 h timelock |
| reentrancy-eth (High) | `GachardStore.requestRotationEntropy` | The callee is Pyth, fixed at construction. The function is `nonReentrant`, and a callback arriving early is ignored rather than corrupting anything. The sequence number only exists after the call, so the write cannot move before it |
| reentrancy-no-eth (Medium) | `GachardAlbums.wishIntoAlbum` | The slot and count are now written before the mint. Only the token id is written after, because it is only known then. A holder that moves the card inside its receiver hook makes `lockForAlbum` revert, which undoes the whole Wish. Proven by `test_wish_is_undone_if_the_card_is_moved_during_the_mint` |
| missing-zero-check (Low) | `setAttestor` | Deliberate: zero switches the attestor off on testnet. Admin only |
| calls-loop (Low) | `registerSeason`, `placeInAlbum` | Calls to the ledger only, bounded at 200 and 50 |
| timestamp (Low) | 9 places | Windows are in hours; a validator can shift time by seconds |
| low-level-calls (Info) | `GachardStore.withdraw` | Needed to send MON |

That test exists because the first version of it passed for the wrong
reason. The ledger calls `onERC1155BatchReceived` even for a single card, and
the hostile wallet had only overridden the single-card hook, so the attack
never ran. A test that passes without exercising its attack proves nothing,
which is also why the invariant suite carries a sanity test.

**Build profile and size.** v2 is built with `FOUNDRY_PROFILE=v2`, which turns
the optimizer on. The default profile is left exactly as v1 was compiled and
verified on Sourcify, so v1 stays reproducible.

Without the optimizer, GachardCards is 37 KB and GachardAlbums 28 KB. Both are
over Ethereum's 24 KB limit (EIP-170), though Monad allows 128 KB (MIP-2).
With it, the sizes are 22.2 KB, 14.2 KB and 9.8 KB, and gas drops 10–17%:

| Action | Without optimizer | With optimizer |
|---|---|---|
| Purchase of 3 cards | 436 k | 378 k |
| Reward claim, Completion and Limited | 346 k | 286 k |
| Holder-signed transfer, median | 78 k | 68 k |

`DeployV2` refuses to run without the v2 profile.

**Deploy scripts** (`contracts/script/v2/`). One library, `V2Setup`, holds the
logic for both the scripts and `test/v2/DeployV2.t.sol`, so what is tested is
what runs.

1. **`DeployV2`** deploys and wires everything with a fresh deployer as
   temporary admin. It refuses:
   - a Guardian equal to the Safe;
   - a Safe address with no code;
   - a relayer that is another role's key;
   - a timelock delay under a day.
2. **Content that must exist before handover**, such as templates for the
   migration, is registered next.
3. **`HandoverV2`** makes the timelock admin, and the deployer renounces.
4. **`CheckV2`** reads every role and parameter back. It fails if anyone but
   the timelock is admin, if a role has a stray member, or if the deployer or
   the v1 admin holds anything.

**Backend and contracts are tested against each other.**
`frontend/lib/v2/chain-v2.ts` holds everything the backend computes that a
contract later checks:
- EIP-712 types and signing;
- v2 redeem codes and print commits;
- rotation secrets and the store derivation;
- the migration Merkle tree.

`frontend/scripts/v2-vectors.mjs` runs that code with fixed keys and writes
`contracts/test/v2/vectors/v2-vectors.json`. `V2VectorsTest` then feeds those
exact signatures, commits and proofs to the real contracts, deployed at the
addresses the vectors were signed for.

Deliberately corrupting the print commit to what v1's `sha3-256` would
produce makes the test fail. That is the bug class it exists to catch.
Regenerate the vectors after changing either side.

`MigrationMinter` adds only Low findings to the Slither run: calls in a loop
bounded at 25, and benign ordering around the mint and `retire`.

## 17. Migration from v1

1. **Stop topping up `PackEntropy`.** It has no withdraw function (ADR-036),
   so any MON left in it is stranded.
2. **Snapshot** the cards collection and the chain at one block. This is the
   append-only record ADR-036 says recovery depends on. Every card becomes
   one leaf `(v1TokenId, holder, templateId, kind)`, built with
   `buildMerkle` in `frontend/lib/v2/chain-v2.ts`.
3. **Deploy v2**, register templates for the existing cards, and deploy
   `MigrationMinter` with the snapshot's root. It mints only through the
   ledger's `MINTER_ROLE`, and it checks v1's live state before each mint:
   - **Digital cards** (`migrate`) go to the holder in the snapshot, but only
     if that holder still holds the card on v1. A card that moved after the
     snapshot is not minted to its old holder.
   - **Exported cards** go to the holder's Privy address. That is a custodial
     act, acceptable on testnet, and it is said plainly to the holder.
   - **Physical cards printed under v1 move as printed cards, with the code
     already in their holder's hand.** v1 committed each code with NIST
     SHA3-256, which Solidity cannot compute, so v1's commitment cannot be
     carried over. But the code itself is kept AES-encrypted in
     `redeem_codes` (`codeEncrypted`), because admins print it on the card.
     The steps:
     1. `migratePrinted` mints the twin to the holder while v1 still shows
        the card printed.
     2. The backend locks it again with a print request signed as the
        custodial holder. The commitment is built from the same decrypted
        code, byte for byte (`legacyRedeemCodeBytes`), and never normalised:
        a v1 code is base64url and may contain `-`.
     3. The card's record marks it as carrying a v1 code, so redeem uses the
        right encoding.

     **v1 must be retired at the cutover**, or the same code would redeem on
     both contracts.
   - **Fallback**, for a code that cannot be decrypted: that card keeps
     redeeming on v1, and `migrateRedeemed` mints its twin to whoever holds
     it once it is Digital again there. The code stays the bearer credential
     (ADR-007). This is the only case that keeps v1 alive after the cutover.

     *Corrected 15 October 2026: an earlier version of this section said the
     codes were never stored. ADR-005 says the plaintext is never stored; the
     encrypted copy is.*
4. **Retire the migrator.** `retire()` makes it renounce `MINTER_ROLE` itself.
   It removes power, so the Guardian may do it at once.
5. **Retire v1 at the cutover**: transfer ownership to a burn address, and
   mark both addresses as retired in `MEMORY.md` and the README. Wait only if
   the fallback above is in use, until those cards are redeemed.
6. **This is the migration paused on 13 October 2026** (new admin wallet, new
   contracts). It resumes once ADR-038, ADR-039 and this document are final.

## 18. Decisions

All eight were decided on 15 October 2026, D2 to D8 as recommended below.

| # | Decision | Decided |
|---|---|---|
| D1 | Safe signers and threshold | **Decided 15 October 2026**: 2-of-3, all held by the founder. Two hardware wallets, plus one backup kept offline in a different place. It protects against one device being lost or stolen, not against the one person being unavailable or coerced. Revisit before mainnet scale, with a second trusted signer or a professional custodian |
| D2 | Pause scope | Privileged paths only; holders' own transfers never paused |
| D3 | Attestor (KMS co-signer) for purchases, Wish Cards and rewards | Required before mainnet; optional on testnet |
| D4 | Redeem code format | 16 characters of Crockford base32 (80 bits), four groups of four |
| D5 | Signer service and custodial keys out of MongoDB | Before mainnet |
| D6 | ERC-2981 royalty slot at 0% | Include; it costs nothing now and saves a module later |
| D7 | Timelock delay | 48 h |
| D8 | Album completion checked on chain | Yes. Album lock is on chain anyway. It stops a leaked Relayer key from minting rewards to an address that never completed an album; with D3 it also stops completing albums through Wish Cards |
