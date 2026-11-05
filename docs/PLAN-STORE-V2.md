# Plan: the new store, built on the v2 contracts

**Status**: proposed, 15 October 2026. Nothing in it is built. It turns ADR-038
(the store sells only what the buyer has seen), ADR-039 (creator Series) and
ADR-040 (the v2 contracts) into an order of work. The screens it builds are
already designed in `design/gachard.pen`.

## Where it ends

A user on Monad Testnet can:
- open the Store tab and reveal cards one at a time across every shelf;
- buy a pack, or a whole shelf at 15% off;
- place cards in an album and use Crystal items;
- complete a season and claim its rewards;
- trade, print and redeem, all on v2;
- see their v1 cards carried over.

No consumer page shows a chain word.

## Rules for every phase

- **Each phase ends usable on testnet, with its tests.** No phase leaves a
  half-built path switched on.
- **The v2 contracts do not change during this plan.** If a phase finds a
  contract bug, it gets an ADR and a fix before anything builds on it.
- **Every value a contract checks** is computed in `frontend/lib/v2/chain-v2.ts`
  and covered by the cross-language vectors.
- **Consumer pages stay chain-free** (ADR-002, design principle 06). Each phase
  greps the built pages, as was done for the footer.
- **A flag** (`CHAIN_VERSION=v2`) keeps v1 working until the cutover in phase 6.

## Decisions needed

Decided on 15 October 2026, as recommended: P1, P3, P4, P5 (a testnet "Season 0"
built from the 8 existing artworks plus one new Limited artwork), P7 and P8.
P2 and P9 follow from Season 0, and P10 comes before mainnet.

| # | Decision | Needed by | Recommendation |
|---|---|---|---|
| P1 | Card prices by rarity, in Credits | Phase 2 | Economy Lab: 40 / 120 / 360 / 1,200 |
| P2 | Album size and season length for the first season | Phase 4 | See P5: content decides it |
| P3 | Crystal item prices and Expansion durations | Phase 5 | Lab proposals. Wish 150 / 250 / 450 / 1,200; Expansion 7 days 250 and 30 days 900; Detection 7 days 150; Reserve 40; Wishlist Alert 100 |
| P4 | Rotation anchor | Phase 1 | UTC 00:00, 06:00, 12:00, 18:00 |
| P5 | First-season content | Phase 4 | Only 8 card artworks exist today, against a 40-card album. Either commission art first, or run a testnet "Season 0" whose album is the 8 existing cards plus one new Limited artwork |
| P6 | What a finished season's album shows | Phase 4 | Stays visible, marked "Season 1 · ended", with its cards still locked |
| P7 | Hosting: Vercel is still linked to the hackathon repo | Phase 0 | A new Vercel project for `gachard-app`. Leave the hackathon deployment untouched |
| P8 | Timelock delay on testnet | Phase 0 | 48 h as on mainnet, with admin actions scheduled two days ahead. Development uses a local chain (see Testing), so the delay never blocks coding |
| P9 | Limited supply for the first testnet season | Phase 4 | Small and round, sized with the 50–70% rule once there are testers to project from |
| P10 | Legal review for each target market | Before mainnet | — |

## Phases

Sizes are relative (S, M, L, XL), not dates.

### Phase 0: foundations (M)

Nothing the user sees changes.
- **Hosting (P7)**: env vars per environment, and `frontend/.env.local`
  restored in this folder.
- **Testnet deploy**: `DeployV2` → register templates → `HandoverV2` →
  `CheckV2`. This waits on the Safe and the Guardian account.
- **`lib/v2/relayer.ts`**: sends v2 transactions from the Relayer keys.
  - Nonce management, with retries that are safe because `purchaseId` and the
    signature nonces make a repeat revert.
  - The transaction is recorded in `transactions` with `contractVersion: 2`
    (ADR-018).
- **Custodial signing**: decrypt the custodial key (ADR-020), call `signV2`,
  and never log the key.
- **Collections**:
  - `series` and `seasons`;
  - `card_templates` gains `v2TemplateId`, `seriesId` and `kind`;
  - `rotations`, `stores`, `purchases`, `albums`, `crystal_items`.

  Every one of them has its unique indexes before the first write.
- **Crystal Night tokens and fonts in `globals.css`.** This is the base for
  every new screen, and it is also design step 6.

**Done when**: `CheckV2` passes on testnet, and a script-driven purchase is
minted through the Relayer.

### Phase 1: the store you can see (L)

- **Rotations start on demand, not on a timer.** The first store request after
  a 6-hour boundary does the work:
  1. commits that rotation's secret;
  2. requests its Pyth seed;
  3. reveals any earlier rotation whose reveal time has passed.

  A unique index on the rotation id means concurrent first visitors commit
  once. A daily Vercel cron is the backstop for reveals on quiet days. This
  matters because Vercel's Hobby plan runs cron at most once a day, so a strict
  6-hour timer would need Pro or an outside scheduler.
- **Stores come from `deriveStore`, and each slot's queue from `derivePack`.**
  They are saved when first built, so they are fixed for the rotation.
- **A bought pack is replaced at once** by the next pack in its slot's queue,
  at most twice per slot per rotation (ADR-038 amendment). Replacement packs
  may hold a limited card while the season's `limitedInRefills` is on.
- **`POST /api/store/reveal`** returns one card. Unrevealed cards never leave
  the server (spec §7).
- **Prices follow ADR-038.** A pack shows its price once fully revealed; a
  shelf shows its price once every pack on it is.
- **The Store tab**:
  - one shelf per Series;
  - the rotation timer;
  - reveal one card at a time;
  - Detection marks;
  - "Preparing the store…" for the few seconds a new rotation's seed takes.

**Done when**: a test proves no response ever contains an unrevealed card, and
prices appear exactly when the rules say.

**Built on 15 October 2026** (local chain; testnet waits for the Safe):
- `lib/v2/store-service.ts` with its ports: `store-repo-mongo.ts`,
  `store-chain.ts` (relayer), `store-repo-memory.ts` for tests;
  `store-view.ts` is the one place a stored pack becomes a response.
- `GET /api/store`, `POST /api/store/reveal`, and the daily backstop
  `GET /api/cron/store-reveal` (`vercel.json`, `CRON_SECRET`). All answer 404
  unless `CHAIN_VERSION=v2`.
- The `/store` page. Buy buttons are shown disabled until phase 2. It is not in
  the navigation yet: the v2 tab bar replaces the navigation at cutover.
- Tests: `scripts/v2-store.test.mjs` (22, including the leak check, which
  fails when a hidden card is let through) and three more in
  `scripts/v2-local.test.mjs` against the contracts on anvil.
- **Found while building**: the limited chance moved from basis points to parts
  per million (spec §7). `V2_EXPECTED_ELIGIBLE_CARDS` (default 300) is the
  pacing estimate until the Lab projects one from real traffic.

Still open in phase 1: a browser check of `/store` against a local MongoDB, and
the store design for replacement packs (the screen shows a plain
"N left in this slot" line until it is designed).

### Phase 2: buying (M)

- **`POST /api/store/purchase`**, for one pack or the whole shelf:
  1. debit Credits in a MongoDB transaction;
  2. get the attestor signature (optional on testnet);
  3. call `GachardStore.purchase`;
  4. create the card documents from the `Purchased` event.
- **The whole-shelf discount** applies only to the first full shelf of a
  rotation, bought in one purchase: 3 packs, or 5 with Expansion. A shelf
  refilled by replacements is not discounted again.
- **On revert**, Credits are refunded. **A limit hit** shows "Processing" and
  the purchase waits for the next window.
- **The old purchase flow goes**: `/collect`, the per-pack PackEntropy flow,
  and `/play` with its nav link. They are switched off behind the flag, then
  deleted at cutover.

**Done when** each of these works:
- one pack, which its slot replaces at once;
- a slot's third purchase, after which it is sold out until the next rotation;
- the whole first shelf, and no discount on a refilled one;
- a retry;
- insufficient Credits;
- a limit reached.

### Phase 3: collection actions on v2 (L)

Every action rewired to holder signatures:

| Action | v2 call |
|---|---|
| Trade sale | `transferWithSig` |
| Dismantle | `burnWithSig`, then Crystal |
| Print | `requestPrintWithSig`, with the 16-character code (D4) |
| Redeem | `redeem`, with the code's bytes |
| Export and import | `transferWithSig`, signed in Privy for self-custody |
| Scan | reads v2 |

The platform hold of ADR-040 lands here too: a `hold` flag on the card and the
account, checked by every action and at import, and shown on Scan as
"On hold".

**Done when**: every action works end to end on testnet, the vectors still
pass, and v1 cards still work through the flag.

### Phase 4: albums, seasons, limited cards (L)

- **Season registration.** It goes through the timelock on testnet, so it is
  scheduled 48 h ahead.
- **The Album tab**:
  - placing a card shows the permanent-lock dialog;
  - progress through the season;
  - the live Limited counter, read from `remaining`.
- **Claiming rewards**: a Completion card always, and the Limited card while
  the album share lasts.
- **The sold-out screen**, which points to the store and Trade.

**Done when**: completing an album on testnet gives the first completers the
Limited card and the rest the Completion card only.

### Phase 5: the Crystal shop (M)

- **Expansion**: 5 packs, and the extra slots never hold a Limited card.
- **Detection**: marks high-rarity packs and never shows a price.
- **Wish Card**: goes straight into the album slot, and costs 50% less in the
  last 14 days of a season.
- **Reserve**: holds a pack 24 h past rotation.
- **Wishlist Alert**.
- **Crystal accounting**: Crystal is debited atomically, and items are
  entitlements with an expiry.

**Done when**: each item works end to end; the catch-up price switches at 14
days out; a Wish Card can never pick a Limited card.

### Phase 6: migration and cutover (M)

**Two ways to grant the migrator `MINTER_ROLE`.** The testnet deployment was
handed over in phase 0, so the grant goes through the timelock and is queued
48 hours before the window. If v2 is instead redeployed fresh for the cutover,
migrate while the deployer is still admin, then hand over. That skips the wait.
1. **Maintenance window**: v1 actions paused and listings cancelled.
2. **`v2-migration-snapshot.mjs`**: review every excluded card.
3. **Deploy `MigrationMinter`** with the root, and execute the queued
   `MINTER_ROLE` grant.
4. **Migrate in batches** and reconcile the counts.
5. **`retire()`**, then `CheckV2`. On a fresh deployment, run `HandoverV2`
   first.
6. **Printed v1 cards**: `migratePrinted`, then lock each again under its
   decrypted v1 code (spec §17).
7. **Retire v1, then flip the flag.** v1 stays up only for a printed card
   whose code could not be decrypted.

**Done when**: every snapshot entry is either migrated or explained, and
`CheckV2` passes.

**Phases 0–3 plus 6 are a complete, smaller cutover.** Albums and the Crystal
shop can then be built directly on v2. That is the recommended order: the
risky part, moving cards, happens before the new features pile on.

### Phase 7: creator Series (XL)

ADR-039:
- creator accounts;
- the Series builder, with the automatic checks of `docs/CREATOR-ASSET-GUIDE.md`;
- the review queue, approval and scheduling;
- a shelf per Series;
- portal statistics;
- read-only game access through an API.

It gets its own plan once phases 0–6 are done.

### Phase 8: before mainnet (L)

- the attestor in KMS (D3);
- a signer service, with custodial keys out of MongoDB (D5);
- the monitoring of spec §15;
- an external audit, then a bug bounty;
- a legal review for each market (P10);
- the mainnet deploy.

## Testing

- **Contracts**: forge, the invariants and the vectors, all of which exist.
- **Backend logic**: `node:test`, as the migration planner already does.
  Covered: derivation, pricing, the discount, the catch-up window and item
  expiry.
- **APIs end to end, on a local chain**: an `anvil` node with v2 deployed by
  `V2Setup`, which makes the timelock delay irrelevant during development.
- **The visibility check**: no chain words in consumer pages after each build.
- **The reveal check**: no API response contains an unrevealed card.

## Risks

- **Content**: one album needs more art than exists (P5).
- **The 48-hour timelock** on testnet makes admin changes slow. Schedule them
  ahead; develop on the local chain.
- **Gas sponsorship and entropy fees** grow with traffic. Watch both balances
  from phase 2.
- **Monad RPC quirks** (ADR-031): never retry a write blindly. The nonces make
  retries safe only if every write goes through `lib/v2/relayer.ts`.
- **Self-custody signing** of v2 typed data in Privy has not been tried on a
  real Privy wallet yet. The vectors cover the format, not the UI.
