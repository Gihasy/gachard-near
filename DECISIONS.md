# Architecture Decision Records

## ADR-001: Token Standard, ERC-1155
**Status**: Accepted
**Decision**: Use ERC-1155 for cards (not ERC-721).
**Reason**: ERC-1155 was chosen for gas-efficient batch operations (mint multiple tokens in a single transaction) and flexibility of multi-token-type in a single contract. **Important note**: although ERC-1155 supports fungible balance (multiple users can hold quantity >1 for the same tokenId), in Gachard each card gets a unique tokenId (one-token-per-instance) to support per-card vault status tracking per ADR-004. Rarity is stored as metadata per tokenId (`cardRarity` mapping), not as grouping of the same tokenId. Open to combination with ERC-721 in production if individual uniqueness is needed (e.g. numbered legendary editions).

## ADR-002: Wallet (Custodial, Hidden from User)
**Status**: Accepted, **amended 22 September 2026** (see Amendment below; "never see a wallet address" is no longer literally true, and the rule that replaced it is stated here)
**Decision**: Users log in via Google OAuth; wallet is created automatically by the backend, private key stored on server. Users only know their username `@user`, never see a wallet address.
**Reason**: Core product philosophy. Blockchain must be completely hidden from end-users for mainstream UX, avoiding Web3/crypto stigma.

**Amendment, 22 September 2026: the boundary is a surface, not a user.**

This ADR says users "never see a wallet address". Since ADR-028 and ADR-031 that is false, and it has been false for longer than the document admitted. The real rule lived only as a comment in `components/wallet/WalletWorkspace.tsx`, which is not where a rule belongs. It is written down here.

**The rule.** The consumer surfaces — `/`, `/collect`, `/collection`, `/play`, `/trade`, `/scan`, `/wishlist` — offer no wallet *action*, for every user, in every state. Not hidden behind a setting: absent. `/wallet` is the one page that is explicit, and `/profile` names Privy only in the "For Advanced Users" section that leads there. Nobody arrives at either by accident.

The word itself survives in exactly one situation, described under **The one exception** below. Everywhere else on those pages it does not appear at all: verified by grep, the seven page files above contain zero occurrences of "wallet".

**Why the euphemism has to stop at that boundary.** Hiding the wallet is right while the wallet is Gachard's responsibility; the user has no decision to make, so the word would only add friction and crypto stigma. Once they connect a wallet of their own the responsibility moves to them, and a soft word for something that is now their liability stops being kind. (That used to be gated by a separate Advanced Access switch in /profile. It was removed on 22 September 2026: it asked the same question twice — a wallet exists here for one purpose — and could only realistically be off by accident, which left /wallet/move blocked with no sign from the profile of why. Connecting the wallet is the decision now. Nothing about the consumer surfaces changes; they carry no wallet actions because those do not exist there, not because a setting hides them.) Three concrete failures, not hypothetical:

- **Sending to an outside address.** The user copies it from MetaMask, Rabby or an exchange, and every one of those says *wallet*. A private Gachard word would leave them unable to match the thing on screen to the thing they are pasting into, in the one flow where a mistake costs the card permanently.
- **The private key screen.** "Reveal private key" has no object without the word. The key to *what*? (That screen is switched off as of 22 September 2026 — see ADR-028 — but the point stands wherever the word has to carry a noun, and it is the clearest example of why.)
- **The warning itself.** It reads "You become responsible for the wallet." A warning written in a vocabulary only this app uses is not a warning. The same applies when the user asks for help: they need words the rest of the ecosystem understands, or they can only ever explain the problem to us.

**What enforces it.** Not review. `components/CardItem.tsx` has no export code path at all — it was removed, not gated, so no setting or prop can bring the button back. Choosing which cards leave happens only on `/wallet/move`, a page of its own: `/wallet` answers "what do I hold?", and stacking a grid of candidates above the cards already held meant neither read as the main list. The invariant is greppable: `"Move to My Wallet"` and `export-wallet` appear in zero client bundles after a build, and they should stay at zero.

**What this costs.** A user who wants to move a card must go to `/wallet` to do it; there is no shortcut from the card itself. That is the intended trade. The previous arrangement put an irreversible action on the consumer surface and relied on a switch to keep it out of sight, which left `/collection` one setting away from becoming a crypto page. One deliberate navigation is cheaper than that.

**The one exception: a card that is already out.** Such a card shows the status **In Your Wallet** and a **Manage in Wallet** link to `/wallet`, both on `/collection`. This is wallet vocabulary on a consumer surface and it is deliberate. The alternative is a card that vanishes from the collection with nothing saying where it went, or a status invented to avoid the word, which would leave the user unable to reason about a card they can no longer print, list or dismantle. The word is the smaller harm.

Note what the exception is not: it appears only *after* the user has moved a card, by their own choice, from `/wallet`. It is never the thing that introduces them to the idea.

**Amendment, 15 October 2026: the footer names no chain.**

The consumer footer stops showing the chain. Today `components/Footer.tsx` renders "Built on Monad · Testnet ↗" on every page, linking to the contract on MonadVision, so that nobody assumes their cards carry mainnet value. That honesty stays, said without chain terms: "Test version · cards have no cash value yet · payments are simulated". The Monad credit and the contract link move to Wallet, the one page already explicit about the chain.

- **Why**: the badge was the last chain term on the consumer surfaces, and it appeared on every page. Its explorer link was a chain detail one click from the landing page. Design principle 06, "Blockchain stays backstage" (`design/gachard.pen`), states the rule this applies.
- **In code the same day.** `Footer.tsx` renders the plain note (`data-testid="test-notice"`) in place of the badge. `/wallet` shows the credit and the contract link in its identity section (`data-testid="wallet-network"`), using a `MonadMark` beside the existing `PrivyMark` in `components/wallet/shared.tsx`.
- **The landing design no longer shows the Privy logo either.** Privy is named only in the "For Advanced Users" section, as above.

## ADR-003: Gas Fee, Platform-Sponsored
**Status**: Accepted
**Decision**: All transactions (mint, print, redeem) are executed by the backend on behalf of the user; the backend/platform covers gas fees.
**Reason**: Users should never hold crypto or understand the concept of gas fees.
**Known limitation**: a single admin/relayer wallet becomes a centralization point that needs multi-sig or a third-party custodian in production.

## ADR-004: Card State Machine (Lock In-Place via Status Flag, Not Burn)
**Status**: Accepted (clarified 28 July 2026)
**Decision**: NFT is never burned on print. Status changes `Digital → Vaulted` (transfer to vault address, normal transfers rejected during this status) `→ Digital` (redeem, transfer to new owner). **On-chain clarification**: Deployed contract `requestPrint()` performs `_update(ownerAddress, address(this))` which moves the NFT to the vault (contract address). `_update()` override blocks normal transfers when `cardStatus == Vaulted`. NFT moves on-chain to the contract when vaulted, not staying in the user's wallet.
**Reason**: History/provenance remains intact within a single token ID, simpler for AI-scan provenance, and more intuitive for the product narrative ("locked", not "destroyed").
**Verified**: 28 July 2026, `safeTransferFrom` on a Vaulted token (tokenId 46) REVERTs with message "Card is vaulted, transfer blocked". Digital tokens (tokenId 45) can be transferred normally.

**Amendment, 15 October 2026: the clarification above does not match the code.** `requestPrint()` in `contracts/src/GachardCard.sol` never moves the token. It sets `cardStatus = Vaulted` and leaves the token in the holder's wallet, and `_update()` then blocks transfers while the card is Vaulted. No version of the file in this repository's history calls `_update(ownerAddress, address(this))`. The verification above is consistent with the code: a Vaulted card cannot be transferred, wherever it sits. The code is the fact. A printed card is locked in place, and the next contract keeps that behaviour (ADR-040).

## ADR-005: Redeem Code, Hash Overwrite per Print Cycle
**Status**: Accepted
**Decision**: Each `requestPrint()` generates a new random code; its hash overwrites the old hash in `storedHash[tokenId]`. Plaintext code is never stored permanently or displayed in UI/on-chain.
**Reason**: Codes from previous print cycles automatically expire without needing a separate "used code" list. Prevents old physical cards (not yet scratched) from remaining valid after a card is reprinted for a new owner.

## ADR-006: Redeem, Backend-Only Access (Rate-Limited)
**Status**: Accepted
**Decision**: `redeemCard()` can only be accessed via backend API (login → input code), not free on-chain calls from any wallet. Backend implements rate-limiting (e.g. max 5 attempts/minute/account).
**Reason**: Since gas is platform-sponsored, free access risks abuse for spam brute-force code guessing with costs borne by the platform, not the attacker.

## ADR-007: Explicit `recipientAddress`, Not `msg.sender`
**Status**: Accepted
**Decision**: `redeemCard()` accepts an explicit `recipientAddress` parameter (the logged-in user's wallet), instead of relying on `msg.sender`.
**Reason**: Since the backend calls the contract on behalf of the user, `msg.sender` is actually the backend/relayer wallet, not the user's wallet, an explicit parameter is needed so the card is sent to the correct user.

## ADR-008: Payment, Two Separate Tracks (Credit vs Direct)
**Status**: Accepted
**Decision**: **Credit** (top-up any amount, stored as integer/cents in the database, used exclusively for buying packs) is completely separated from **Direct Payment** (per transaction, required for print requests, cannot use credits).
**Implementation status (15 Sep 2026)**: Stripe was the intended processor, but no payment SDK is integrated. Both tracks currently run through a simulated checkout that mints `sim_<timestamp>` payment ids. The two-track separation is real; the payment rail is not.
**Reason**: Print requests have real costs (printing + shipping) that are intentionally separated from the virtual pack economy. Reduces repeated Stripe integration for each pack purchase.

## ADR-009: Odds/Rarity (Stored in Backend, Not On-chain)
**Status**: Accepted
**Decision**: Rarity distribution (odds table) is stored in the backend database, can be changed without redeploying the contract. Only the final reveal result is recorded on-chain.
**Reason**: Flexibility to tune odds during testing without the cost/delay of contract redeployment.

## ADR-010: Marketplace ("Coming Soon", Not a Demo Feature)
**Status**: Accepted
**Decision**: Marketplace is only displayed as a UI placeholder "Coming Soon" for the hackathon, not functional (no real trading/listing).
**Reason**: Not a core product differentiator; time redirected to the core mint–vault–redeem loop and AI scan features required for the hackathon theme.

## ADR-011: Card Artwork, Manual AI Generation Upfront
**Status**: Accepted
**Decision**: Card artwork is generated once upfront manually, not generated on-demand during reveal.
**Reason**: Demo reliability. On-demand generation adds complexity and wait time that risks issues during live presentation.

## ADR-012: Emergent → Claude Code + Self-Hosted Migration
**Status**: Accepted
**Decision**: Use Emergent (via 7-day pass + first month Standard, ~350 credits) specifically for Sprint 1–3 (foundation, mint, vault/redeem state machine). After that, push code to GitHub and continue Sprint 4–6 with Claude Code (Pro, $20/month). Self-deploy to Vercel (frontend), Render/Railway (backend), MongoDB Atlas (database), all free tier for hackathon demo scale. Smart contract remains deployed directly to Monad Testnet, independent of hosting choice.
**Reason**: Emergent's cost model (credit-per-action) is not predictable and expensive for long-term use; Claude Code (flat subscription) is more predictable for iterative work in Sprint 4–6. The stack used by Emergent (React/Next.js + FastAPI + MongoDB) is portable to any standard hosting.
**Migration note**: audit Stripe integration (and other Playbook integrations) to ensure using direct SDK/API, not relying on Emergent-specific environment configuration.

## ADR-013: Delivery Platform, PWA (Progressive Web App)
**Status**: Accepted
**Decision**: Gachard is built as a PWA (manifest.json + service worker on top of React/Next.js stack), not a separate native app for iOS/Android.
**Reason**: Avoids App Store review process that risks being blocked by Apple's policies on NFT/digital collectibles. Single codebase for all platforms, fitting the hackathon timeline. Camera (for AI-scan) and Stripe checkout still function normally in web/PWA context.
**Known limitation**: push notifications on iOS PWA are still more limited than native apps, not relevant for hackathon demo, noted for production consideration.

## ADR-014: Tool-Agnostic Documentation + Per-Tool Adapters
**Status**: Accepted
**Decision**: Core project documents (`README.md`, `MEMORY.md`, `DECISIONS.md`, `docs/`, `sprints/`) are written purely as tool-agnostic markdown. Each AI coding tool used (Emergent, Claude Code, MiMo Code, etc.) has one small "adapter" file (`CLAUDE.md` for Claude Code, `.mimo/config.md` for MiMo Code) that points to the same core documents, not duplicating content.
**Reason**: The team considers switching tools/models (Emergent → Claude Code → MiMo Code with MiMo V2.5 Pro model, possibly switching again). With tool-independent core documentation, switching tools doesn't require rewriting context, just create a new adapter if needed.
**Note**: MiMo Code (early release, still alpha as of July 2026) supports connections to various LLM providers (not locked to MiMo models only) and automatically imports configuration from Claude Code during migration, which strengthens the feasibility of this adapter approach. Since it's still early-stage software, maintaining frequent Git commits as a fallback remains important in case the tool is unstable.

## ADR-015: Primary Tool, MiMoCode (mimo-v2.5-pro) From the Start, No Emergent
**Status**: Accepted (supersedes the approach in ADR-012)
**Decision**: All development (Sprint 1–6) uses MiMoCode (model `mimo-v2.5-pro`, paid via Xiaomi MiMo Platform or custom third-party provider) from the start. Emergent is not used at all. Git + GitHub repo setup is done manually from Sprint 1 (not auto-sync like Emergent). Self-hosted setup (Vercel/Render/MongoDB Atlas, free tier) is prepared from Sprint 1, not waiting for mid-project migration.
**Reason**: Simplifies to one tool throughout the project (instead of two different tools at different phases), cost model is more predictable (Token Plan/pay-as-you-go), and MiMoCode has a persistent memory system (`MEMORY.md` auto-loaded, task tracking, checkpoint) that fits our documentation approach.
**Supersedes**: ADR-012 (Emergent → Claude Code plan) no longer applies.

## ADR-016: Correction, MiMoCode Auto-Loaded Files
**Status**: Accepted
**Decision**: `MEMORY.md` is the official file automatically read by MiMoCode each session (part of its built-in persistent memory system: `MEMORY.md`, `checkpoint.md`, `notes.md`, `tasks/<id>/progress.md`). `.mimo/config.md` and `CLAUDE.md` are **not** files automatically read by MiMoCode, both are maintained as references for humans/other tools (e.g. if switching back to Claude Code later), not as auto-load mechanisms for MiMoCode.
**Reason**: Technical clarification after checking MiMoCode's official documentation directly (July 2026), main instructions for the agent were moved to the top of `MEMORY.md` to ensure they are actually auto-read.

## ADR-017: Backend Architecture, Next.js API Routes as the Sole Backend
**Status**: Accepted
**Decision**: All backend logic (auth, wallet, blockchain transactions, rate-limiting) runs via Next.js API routes (`app/api/`). The separate FastAPI backend (`backend/`) is fully removed.
**Reason**: Three separate backend hosting options (Koyeb, Railway, Fly.io) are closed or require credit cards; Render has issues with available cards. Next.js API routes are already deployed on Vercel at no extra cost, reducing infrastructure complexity from 2 services to 1.
**Supersedes**: References to FastAPI/Render/Railway in ADR-012 and ADR-015 no longer apply to backend.

## ADR-018: Async Pattern for Blockchain Transactions
**Status**: Accepted
**Decision**: All endpoints interacting with the smart contract use an async pattern:
1. Endpoint immediately returns `{status: "pending", txHash: null}` once the transaction is sent to the chain, NOT waiting for confirmation.
2. Transaction status is stored in MongoDB `transactions` collection, updated to `confirmed`/`failed` via a separate process.
3. Frontend polls endpoint `/api/transactions?txId=...` every few seconds until it gets `confirmed`.
**Reason**: Blockchain confirmation takes 1-2 seconds on Monad Testnet. The async pattern is more scalable and enables retry/resilience.

## ADR-019: MongoDB-Based Rate-Limiting for Redeem
**Status**: Accepted
**Decision**: Rate-limiting for `redeemCard()` uses MongoDB `rate_limits` collection, not in-memory storage. Max 5 attempts per user per minute (see ADR-006). Each attempt is recorded with a per-minute timestamp window.
**Reason**: Serverless functions on Vercel are stateless, so in-memory storage is inconsistent across invocations. MongoDB ensures rate-limiting remains effective even if requests are routed to different instances.

## ADR-020: Private Key Encryption in Database
**Status**: Accepted
**Decision**: All private keys (user wallets and admin wallets) are encrypted using AES-256-GCM before being stored in MongoDB. The secret key is stored in environment variable `ENCRYPTION_SECRET_KEY` (minimum 32 characters), not in the database. When used to sign transactions, the private key is decrypted first.
**Reason**: Plaintext private keys in the database are a critical security risk, if the database leaks, all wallets can be stolen. AES-256-GCM provides authenticated encryption (integrity + confidentiality). The secret key in env var ensures that database compromise alone is not sufficient to decrypt.

## ADR-021: Pack System (Standard & Booster)
**Status**: Accepted
**Decision**: Two pack types available:
- **Standard Pack**: 5 cards at 500 Credits (1 guaranteed Rare+)
- **Booster Pack**: 10 cards at 800 Credits (2 guaranteed Rare+)

Cards follow the normal odds table. Guaranteed slots are Rare/Epic/Legendary with relative weights. Mint via `mintBatch()` atomic (1 transaction for the entire pack). Guaranteed slots are shuffled so they're not always in the same position.
**Reason**: Two pack tiers give users choice based on budget. The Standard pack offers quick collection building, while the Booster pack provides better value per card. Atomic `mintBatch()` saves gas and ensures consistency (all or nothing).
**Supersedes**: Previous ADR-021 referenced "8 cards per pack", updated to match actual implementation.

## ADR-022: AI Vision (Deferred, Not Started)
**Status**: DEFERRED. Not implemented.
**Decision**: AI vision for visual card analysis is deferred from the current hackathon scope. All card verification relies on QR lookup, matching on-chain state against MongoDB.
**Correction (15 Sep 2026)**: this record previously stated that reference code remained in `lib/vision.ts`. That file has never existed, no vision code was ever written. Corrected so the record matches the repository.
**Correction (15 Sep 2026)**: this record previously called AI vision "a required eligibility criterion for the AI x Web3 theme across all tracks". That requirement could not be confirmed on the Metropolis programme page, which describes AI as the focus of Track 04 rather than a universal gate. Treat it as unverified rather than established.
**Reason for deferral**: priority went to stabilising the core loop. The AI that is live is text-based, trade risk scoring and marketplace insight, both via MiMo (ADR-030).
**Intended value if built**: comparing a photographed card against its on-chain template would catch forgeries that carry a valid-looking QR code, which QR lookup alone cannot detect.

## ADR-023: Card Template System
**Status**: Accepted
**Decision**: Cards are based on templates stored in MongoDB `card_templates` collection. Each template defines: name, description, image path, rarity, and a unique templateId. When a card pack is opened, random templates are selected based on odds table, and individual cards are minted from these templates. This separates the card design (template) from the individual instance (card).
**Reason**: Enables easy addition of new card designs without smart contract changes. Templates can be managed via admin console. Each card instance tracks its template reference for metadata lookup.

## ADR-024: Marketplace, Functional Trade System
**Status**: Accepted. Supersedes ADR-010
**Decision**: Implement full marketplace with listing, buying, cancelling. Cards listed via `isListed` flag (MongoDB) + `marketplaceTransfer()` on-chain. Marketplace fee 8%. FVM (Fair Value Market) calculates average sold price per template. AI-powered market insight and price suggestion via LLM (provider is MiMo, see ADR-030; this line previously said Gemini API). Print blocked while card is listed.
**Reason**: Enhances demo value for the hackathon. Shows full card lifecycle: mint → collect → trade → print → redeem. Blockchain abstraction is maintained: users see Credit prices, not crypto.

**Amendment, 25 September 2026: the 8% fee is removed from Crystal trades.** The seller now receives the whole listing price.

The fee deducted 8% and credited it nowhere — not to a treasury, not to an account; it was simply not paid out. Crystal cannot be bought, topped up, transferred or cashed out (ADR-026), so the deduction could never become revenue however long it ran. It cost every seller 8% of every sale and earned the platform nothing, which is the worst shape a fee can take: a real cost to users in exchange for an imaginary one to the business. It was also written up as a revenue line in the pitch material, which is how a harmless-looking constant became a claim that would not survive one follow-up question.

The fee itself is not abandoned. It moves to where a fee can actually be collected, which is ADR-034, and which is not built.

**Free is the design, not a gap.** Trading in Crystal costs nothing and requires nothing: no export, no wallet, no signature, no gas. That is what the everyday collector gets, and it is deliberately the cheapest path in the product. The fee lives one tier up, on the marketplace that requires exporting to a self-custody wallet (ADR-034), where the thing being bought is real liquidity rather than an in-app swap. The two tiers differ in what they offer and therefore in what they cost — a free tier is only a weakness if the paid tier is the same product with a toll on it.

**And there is a reason a fee here would be worse than merely unprofitable: it would tax the consolation prize.**

Opening packs produces duplicates. That is not a flaw in the odds, it is what pack-opening *is*, and it is the moment a collector is most likely to feel they wasted their money. Dismantling is the answer to that moment — and it is the **only** way Crystal is created. Nothing else mints it: not top-ups, not rewards, not purchases. `addCrystal` is called on a dismantle, and everywhere else it only moves Crystal that already exists between users or returns it to whoever paid.

So the loop is closed and deliberate: the card you did not want becomes the currency for the card you did. A duplicate stops being a loss and becomes progress toward a specific target.

Charging 8% on the spend end of that loop taxes the recovery from a bad pull. The user has already been disappointed once; the platform then takes a cut of the compensation, in a currency it cannot spend. Even at a fee that produced real revenue, this would be the wrong place to take it — it is a toll on the mechanism that makes an unlucky pack survivable.

**This is what keeps the free tier genuinely free.** ADR-034 warns that the ladder collapses if an in-app Crystal swap ever carries a fee. This is the concrete reason: it would not just blur two tiers, it would charge people for recovering from the randomness the product sells them.

**Consequence, the Crystal supply now only grows.** This 8% was the only sink in the app: dismantling creates Crystal (ADR-026), marketplace purchases move it between users, and nothing else destroyed any. Removing it means total Crystal rises with every dismantle and never falls. That is not a financial risk — Crystal is not purchasable and not redeemable, so there is nothing to be devalued in money terms — but listing prices will drift upward over time, and early dismantlers accumulate an advantage that never dilutes. If a sink is wanted later it should be something users choose to spend on, not a tax on the one action the marketplace exists to encourage.

## ADR-025: AI Anomaly Detection Oracle for Trade
**Status**: Accepted
**Decision**: Detect wash-trading patterns in marketplace transactions using an Oracle approach:
1. **Deterministic signals** (`fraud-signals.ts`): `repeatPairCount` (wallet pair frequency), `priceDeviationPct` (price deviation from FVM), `resaleSpeedHours` (resale speed).
2. **AI risk scoring** (`risk-score.ts`): an LLM synthesizes the three signals into a 0-100 score. Provider is MiMo, see ADR-030. (This line previously said Gemini, which never matched the code.) Threshold `flagged = riskScore >= 70`.
3. **On-chain Oracle** (`recordVerification()`): Score and flag results are posted to the smart contract, recorded permanently on blockchain.
4. **FVM exclusion**: Transactions with `flagged === true` are excluded from FVM calculation to prevent price manipulation.
5. **Non-blocking**: All scoring occurs AFTER the transaction completes, never blocks or cancels trades.
**Reason**: Wash-trading (A sells to B, B sells back to A at a higher price) threatens FVM integrity and marketplace economy. Oracle pattern ensures verification results are transparent and auditable on-chain, not just in the backend database.

## ADR-026: Dismantle & Crystal, Burn-to-Earn Currency
**Status**: Accepted
**Decision**: Digital cards can be "dismantled" (permanent on-chain burn) to earn Crystal, a new currency that CANNOT be purchased, topped up, or transferred. Crystal can only be obtained from dismantle. `crystal_balances` collection is completely separate from `credits` so the two currencies never mix. Burned cards change status to `"Burned"` in MongoDB (not deleted) to maintain provenance and transparency via Scan. Burned cards don't appear in the active Collection grid but can still be searched by Card ID.
**Dismantle rates**: Common=20, Rare=50, Epic=120, Legendary=300 Crystal (proportional to FVM price range).
**On-chain**: `burnCard(tokenId, owner)` calls OpenZeppelin `_burn()` which permanently destroys the ERC1155 token. Only Digital cards can be burned, Vaulted cards are blocked by the existing `_update()` override.
**Replaces Buyback concept**: Dismantle & Crystal replaces the buyback plan, permanent on-chain burn, non-purchasable/non-cashable new currency, no financial liability.
**Roadmap (NOT built in this session)**: Crystal trading system between users will restructure the existing Marketplace. Crystal will become an alternative currency for listing and buying cards from other users.
**Reason**: On-chain burn proves cards are truly destroyed (transparent, auditable on Monad Explorer). Crystal as a non-purchasable currency avoids financial liability and regulation. Separate collections prevent cross-currency bugs.
**Known limitation**: After burn, `cardStatus(tokenId)` on-chain still shows the last value before burn (not reset to "Burned" state) because the ERC1155 token no longer exists after `_burn()`. The source of truth for "Burned" status is in MongoDB (`cards.status === "Burned"`). Keep in mind that if there's a future feature reading `cardStatus` directly from chain without cross-checking MongoDB, need to check `balanceOf(owner, tokenId) == 0` as a burn indicator.

## ADR-027: Become a Creator, Whitelist Form for IP Owners
**Status**: Accepted
**Decision**: The `/creators` page provides a whitelist form for external IP Owner collaboration. Purely web2 feature (MongoDB `creator_applications` collection, no blockchain). Form collects: name, brand/IP, IP type, social media, email, interest, estimated community size. Honeypot field `website_url` for anti-spam bot (returns fake 200 without insert). Admin "Creators" tab displays all submissions. Revenue split 70/30 (creator/platform) per the infrastructure-first model from the PRD.
**Reason**: Acquiring external IP Creators is Gachard's primary growth vector. Whitelist form enables a partner pipeline without technical commitment from creators. Web2-only because there's no blockchain need for registration, blockchain only becomes relevant after IP is onboarded and cards are minted.

## ADR-028: Privy Integration, Optional Self-Custody Wallet
**Status**: Accepted, **amended 22 September 2026** (see Amendment below; the pinning constraint no longer holds)
**Decision**: Integrate Privy embedded wallet as optional "For Advanced Users" section in `/profile`. Uses `@privy-io/react-auth@1.93.0` (pinned, v2+/v3+ incompatible with Turbopack/Webpack in Next.js 16). Progressive disclosure UX: no technical terms visible until user explicitly expands "Show Technical Details". Wallet creation via Privy SDK, address verifiable on Monad block explorer. Export private key NOT available in v1.93.0 (`useExportWallet` hook added in v2+).
**Scope**: ONLY affects `/profile` page. Core flow (pack purchase, fulfill, print, redeem, marketplace) remains 100% custodial, no changes to mint, blockchain.ts, or smart contracts.
**Reason**: Gachard's central bet is that mainstream users should never see a wallet (ADR-002). But that bet only holds if the people who *do* want custody of their own keys are not locked out. Privy lets both audiences share one app: the default path stays fully custodial, and a user who wants a self-custody wallet can create one without a single blockchain term appearing until they ask for it. Scoped to `/profile` so the core flow carries zero added risk. It also makes the project eligible for the Privy bounty ($5,000) at the Monad Metropolis Hackathon, which is a welcome side effect rather than the reason for the design.
**Known limitation**: Export private key not available. The wallet address can be viewed and verified on block explorer, but cannot be exported to other wallets. Decision to pin to v1.93.0 was made after confirming v2+/v3+ dependency tree (@headlessui/react v2 → react-aria v3 subpath exports; WalletConnect/AppKit) is incompatible with both Turbopack and Webpack in Next.js 16.
**Amendment, 22 September 2026, the pin is lifted.**

The constraint this ADR rests on was retested and no longer holds. `@privy-io/react-auth@3.44.0` installs, builds under Turbopack on Next.js 16 in about 10 seconds, typechecks, and runs: `/profile` loads, the SDK initialises, and `auth.privy.io/api/v1/apps/<appId>` answers 200. It still pulls the dependency tree named above, `@headlessui/react` v2 and WalletConnect, so that tree was never the real blocker, or it has since been fixed upstream. Exactly one line of our code had to change: `embeddedWallets.createOnLogin` moved under an `ethereum` key.

**The upgrade was not optional in the end.** This app's Privy wallets run in `user-controlled-server-wallets-only` mode, and v1.93.0's `delegateWallet` targets the delegated-actions flow Privy has retired. Calling it does not fail, it hangs: nothing answers and the promise never settles. Delegation is required for the server to act on a user's wallet at all (ADR-031), so on v1.93.0 the export/import feature could never have worked. The pin was not a safe default, it was a dead end.

**What the upgrade changed for us:**

- `useSigners().addSigners()` replaces the retired API and works. Delegation is proven against a real wallet.
- **`useExportWallet` is available**, so the "Known limitation" above is void as a *constraint*: the SDK can do it. Shipping it is a separate question, answered separately — see the note below.
- `useSessionSigners` exists but is deprecated in favour of `useSigners`.

**Two runtime differences that cost time, recorded so they are not rediscovered:** `signTypedData` resolves to `{ signature }` in v3 where v1.93.0 resolved to the string, and typecheck cannot catch the difference when the value goes straight into `JSON.stringify`. And the SDK provides no way to attach the `privy-authorization-signature` header, which delegated wallets require: passing it in the rpc params leaves it in the body, passing it through request options never reaches the wire, and both return 401. Sponsored sends therefore call `POST /v1/wallets/{id}/rpc` with `fetch` directly; everything else still goes through the SDK.

**Key export is built and switched off, 22 September 2026.** `useExportWallet` works, and the "Reveal private key" section exists behind a `SHOW_KEY_EXPORT` constant in `components/wallet/WalletWorkspace.tsx`. It is `false`, so the bundler drops the block entirely and the strings appear in zero client chunks — not hidden from the page, absent from it. The reason is asymmetry: every other irreversible action here is at least *visible* as a risk the user chose, while a key that has been seen cannot be un-seen, by the user or by anyone standing behind them. Flipping the constant is a deliberate act, which is the point.

**Scope is also wider than this ADR states.** Privy is no longer confined to `/profile`. It now has its own page at `/wallet`. Both pages mount their own `PrivyProvider` as islands rather than a global one, so the isolation this ADR was built to protect still holds: the SDK never loads on pack opening, and verified after build, its chunk is absent from the prerendered HTML of both pages. `/collection` briefly carried a per-card export button as well; it was removed on 22 September 2026 and the reasoning is recorded in the amendment to ADR-002.

## ADR-029: Pyth Entropy for Provably Fair Pack Randomness
**Status**: Accepted
**Decision**: Pack rarity is derived from a seed supplied by Pyth Entropy on Monad Testnet, not from `Math.random()`. A dedicated `PackEntropy.sol` contract implements `IEntropyConsumer` and holds its own MON balance to pay entropy fees. The flow is three steps: `requestPack()` asks Pyth for randomness; Pyth's `entropyCallback()` writes the seed on-chain; `fulfillPack()` accepts the rarities computed off-chain, checks them, stores a commitment, and mints.

Four properties make the result auditable:
1. **Seed provenance**: `packSeed` can only be written by the Pyth Entropy contract. `IEntropyConsumer._entropyCallback()` enforces `require(msg.sender == entropy)`, `entropyCallback` is `internal` so there is no other entry point, and the entropy address is `immutable`, fixed at construction to `0x825c0390f379C631f3Cf11A82a37D20BddF93c07`. The backend cannot inject a seed.
2. **Hash commitment (Opsi C)**: `fulfillPack()` stores `keccak256(abi.encodePacked(packSeed[seq], rarities))`. This binds the rarities to that specific seed permanently.
3. **Structural check**: `require(rarePlusCount >= req.guaranteed)` makes the advertised Rare+ guarantee unbreakable by the backend; a violating pack reverts.
4. **Independent verification**: anyone can read `getSeed(seq)`, recompute the rarities with the documented deterministic shuffle, recompute the commitment, and compare against `getRarityHash(seq)`. `frontend/scripts/verify-entropy-onchain.ts` does exactly this, and `/api/verify/pack/[txHash]` exposes it publicly.

**Shuffle location (Opsi B)**: the seed lives on-chain, the Fisher-Yates shuffle runs off-chain in `buildPackRaritiesFromSeed()` (seeded xorshift64). Chosen over an on-chain shuffle to save roughly 150k-200k gas per pack.

**Access control**: `requestPack()` and `fulfillPack()` are both `onlyOwner` (the admin relayer). This was added after a security review, without it, anyone could fulfill someone else's pack.

**Fee handling**: `PackEntropy` pays entropy fees from its own balance rather than the admin wallet, so the fee budget is monitorable separately from gas. The contract balance needs periodic checking; the admin console surfaces it.

**Reason**: "Provably fair" is the core trust claim of any pack-opening product. With `Math.random()` a user simply has to believe the server. With this design the user can verify a specific pack after the fact, and the platform cannot alter a pack's outcome after seeing the seed without producing a commitment mismatch that anyone can detect.

**Verified**: 78/78 Foundry tests pass (20 covering PackEntropy, including a runtime proof that an unauthorized `entropyCallback` caller is rejected). 9 live production transactions were re-verified independently on 15 September 2026, commitment hash, per-token `cardRarity()`, and the Rare+ guarantee all matched in every case.

**Known limitation**: the shuffle algorithm itself is not cryptographically constrained. The commitment proves the rarities were derived consistently from the on-chain seed, but a biased algorithm would still produce a matching hash. Closing that gap requires moving the shuffle on-chain, at the gas cost noted above. This is a deliberate trade-off, not an oversight.

**Contracts**: `PackEntropy` at `0x6B53C35e8baBaaBe4DD725573C3f612121764542`, minting through `GachardCard` at `0x2a05a2e3b0e7355b97de593e354063e9474c9d08` via the `authorizedMinters` role. Both verified on Sourcify (`exact_match`).

## ADR-030: MiMo as the Single AI Provider
**Status**: Accepted
**Decision**: All LLM calls in the application go to MiMo (`MiMo-V2.5-Pro`) through one OpenAI-compatible endpoint, configured by `MIMO_API_KEY` (plus optional `MIMO_BASE_URL` and `MIMO_MODEL`). This covers trade risk scoring (`lib/risk-score.ts`) and marketplace insight plus listing-price suggestion (`lib/market-insight.ts`). `lib/market-insight.ts` previously called Gemini directly; it was migrated to MiMo on 15 September 2026.

**Reason**: two providers meant two credentials, and in practice neither was configured in production. `GEMINI_API_KEY` existed only in the local `.env.local` and `MIMO_API_KEY` was documented nowhere at all. Both AI features were therefore silently inert in production while the documentation advertised them. One provider means one key to set and one thing to verify after deploying.

**Consequence, failures are silent by design**: `calculateRiskScore()` catches its own errors and returns `{ riskScore: 0, flagged: false, reasoning: "AI scoring unavailable" }` so a provider outage never blocks a trade. That is correct behaviour for the user, but it means a missing key looks identical to "no suspicious signals". **After any deployment, confirm `MIMO_API_KEY` is set**, nothing will fail loudly if it is not.

**Scope**: `@google/generative-ai` is left in `package.json` for now; removing it is safe cleanup but npm reinstalls on this Windows setup have historically corrupted `node_modules`, so it is deferred rather than risked mid-hackathon.

**Note on AI vision**: card image verification remains unbuilt. ADR-022 deferred it, and nothing in this decision changes that, this ADR is only about which provider serves the text-based AI features that already exist.

## ADR-031: Card Export and Import via Privy, With Server-Side Sponsored Signing
**Status**: Accepted
**Supersedes the scope of**: ADR-028 (Privy stays optional and isolated, but is no longer view-only)

**Decision**: A user may move a Digital card out of Gachard's custodial wallet into their own Privy embedded wallet, and move it back. Privy is the active executor in both directions, not a destination address.

**Export**: the user first signs an EIP-712 intent with their own Privy wallet naming the tokenIds, the destination address, and a single-use nonce. (Amended 22 September 2026: the struct was `ExportIntent` with one `tokenId` and was signed once per card, which meant a Privy dialog for every card in a selection. It is now `ExportBatch` with a `uint256[] tokenIds`, signed once for the whole selection. The transfers are still one request per card, because ADR-018 caps a function at ten seconds; only the dialog count changed. The server verifies the array exactly as sent — a reordered or extended one produces a different digest and fails recovery — and then refuses any card not in it. Replay protection became per card within the batch, keyed `nonce:tokenId`, and the rate limit is counted once per signature rather than once per card, since five cards would otherwise exhaust ADR-006's five-a-minute allowance mid-selection. A signature covers at most 20 cards.)

**Import, amended 22 September 2026: returning is a selection too.** Cards in the wallet are picked the same way and returned together. There is no batched signature because there is no signature at all — the wallet has delegated to Gachard, which is the whole reason the server can send on the user's behalf — so a batch here is purely a selection. It is still one request per card for the same ADR-018 reason. The one thing that had to change is the limiter: ten cards is ten calls, and ADR-006's five-a-minute would have cut a user off midway through their own selection, so `checkRateLimit()` now takes an explicit ceiling and `privy_import` passes `DAILY_SPONSORED_LIMIT`. That does not raise what this costs us. Every return is one sponsored transfer and `consumeSponsorshipBudget()` still caps those at 20 per user per day; the per-minute limit was a burst guard, not the spend ceiling. The default stays five, verified: a caller using the default is denied on the sixth attempt and one passing 20 on the twenty-first.) The backend verifies the recovered address matches the Privy wallet recorded for that user, then calls `marketplaceTransfer()` from the admin wallet, because the custodial wallet is the only party that can move a card it holds. A claim transaction is then sent **from the user's Privy wallet with gas paid by Privy**, and only a card that has been claimed may be imported back.

**Import**: the user signs and sends `safeTransferFrom` themselves, from their own Privy wallet, with gas paid by Privy. The backend cannot do this and deliberately has no route that can. The import is settled only once `balanceOf(custodialWallet, tokenId) == 1`, read directly. An earlier draft of this ADR specified a `TransferSingle` scan anchored to the claim block, carried over from a design where the backend had to notice a transfer it had not initiated; since we send the transfer and hold its hash, one balance read is cheaper than log pagination and is stronger evidence than a matching event. `exportClaimBlock` is still recorded as provenance but is no longer load-bearing.

**The `sponsor` flag never appears in client code.** All sponsored transactions are sent server-side through `@privy-io/node` using `PRIVY_APP_SECRET`, and the Privy Dashboard option "Allow transactions from the client" stays **off**. `NEXT_PUBLIC_PRIVY_APP_ID` is inlined into the browser bundle by definition, so with that option on, the only thing guarding the sponsorship balance would be a value printed in the page source. This holds independently of the SDK pinning problem and would still hold if that problem disappeared.

**Client SDK, superseded 22 September 2026.** This ADR originally kept `@privy-io/react-auth` at 1.93.0, on the grounds that its signing hooks were sufficient and the v2/v3 upgrade ADR-028 rejected was therefore unnecessary. The signing hooks were indeed sufficient; delegation was not. v1.93.0's `delegateWallet` targets a flow Privy has retired and simply hangs against this app's wallet mode, and without delegation the server cannot send from a user's wallet, which makes import impossible. The client is now on **v3.44.0**. See the amendment to ADR-028. Signing still happens on the client and sponsorship still happens on the server, so the division this ADR describes is unchanged; only the version is.

**No smart contract changes.** `marketplaceTransfer()` is `onlyOwner` but does not constrain the recipient, which covers export. Import rides on stock ERC-1155 `safeTransferFrom`, since the `_update()` override blocks only `Vaulted` cards. The H-2 fix already maintains `lastOwner` on standard transfers, so a user-initiated transfer does not corrupt the state `redeem()` depends on. `GachardCard` and `PackEntropy` are untouched, so no redeploy, no re-verification, and the 78/78 suite still stands.

**"Exported" is a MongoDB status, not an on-chain enum**, following the precedent set for "Burned" in ADR-026. Adding a `CardStatus` member would require a redeploy and would invalidate the paragraph above. The on-chain way to confirm a card is out is `balanceOf(custodialWallet, tokenId) == 0`. Reusing the existing `status` field is deliberate: `dismantle` and `marketplace/listings` already require `status === "Digital"`, so both are guarded by construction; only `print` needs a new check, because it tests only for "Burned".

**Reason**: the Privy bounty requires integration beyond authentication, and ADR-028's wallet is created as a side effect of login and then only displayed, which almost certainly does not qualify. More durably, export/import is the feature that gives ADR-028's "For Advanced Users" section a reason to exist and closes the loop the README roadmap already promises. Import is the strongest evidence of the claim: the card is genuinely the user's, and Gachard has no route that can take it back.

**Verified on 21 September 2026** with three gates, all passed. A throwaway wallet sent a zero-value self-transfer on Monad Testnet with `sponsor: true`; it confirmed in block 64494516 using 248,734 gas, the on-chain payer was neither the user's wallet nor the admin wallet, and the wallet's balance was 0.0 MON before and after. The server SDK builds, typechecks and loads in the Next.js Node runtime without touching Turbopack.

**Consequence, sponsorship is asynchronous**: `wallets().rpc()` returns an empty `hash` plus a `user_operation_hash` and a `transaction_id`. The real hash appears only after polling `transactions().get()`. Code that trusts the first response stores an empty string and fails silently, which is the same failure shape as the `tokenId: null` bug fixed in commit `4658e4e`. Every sponsored call must treat `transaction_id` as the source of truth and poll.

**Consequence, sponsored wallets carry EIP-7702 code**: sponsorship runs on ERC-4337 with Alchemy as provider, and after its first sponsored transaction the user's wallet holds `0xef0100...` delegation code. The address does not change, so the destination a user sees is stable. But ERC-1155 `safeTransferFrom` refuses a recipient with code unless it implements `onERC1155Received`. Confirmed with a real transfer on 21 September 2026, not just an `eth_call`: a test token moved into a delegated wallet (120,511 gas) and came back out through a sponsored transfer the wallet signed itself, with its MON balance still 0.0; the token was burned afterwards and nothing was left behind. This depends on a third-party implementation and must stay covered by an integration test. Export is immune regardless, because `marketplaceTransfer()` calls `_update()` directly and skips the acceptance check; that immunity is inherited luck and is now a property to preserve deliberately.

**Consequence, spend control is ours**: Privy caps total spend only. Per-user and per-timeframe limits are the application's job, and every import is one sponsored transaction, so an export/import loop drains the balance unless rate limited. `checkRateLimit()` from ADR-019 is reused. A global dashboard cap is adequate for the hackathon demo and is not adequate for public use.

**Operational hazard, the Monad RPC "could not coalesce error"**: seen three times during testing, and the transaction had landed every time; only the client-side response parsing failed. Blind retry around a write would therefore execute it twice. Existing code is safe because `withRetry()` wraps reads only, but every new write path must check on-chain state before retrying rather than retrying on the error alone.

**Known limitation**: a card sitting in a user's Privy wallet cannot be listed, printed, dismantled or redeemed until it is imported back. This is inherent, not a defect: the platform does not hold it. `wallets().list()` also returns HTTP 500 against this account, so wallet ids are read from MongoDB rather than from Privy.

## ADR-032: One Identity, the Signed Session Cookie

**Status**: Accepted, 22 September 2026, **file renamed 23 September 2026** (see the note at the end; the decision is unchanged)
**Note**: no ADR ever recorded how sessions work in this app. The cookie, the HMAC, the client-written fallback and the two different gates all arrived without one, which is part of why the gap survived as long as it did. This ADR states the mechanism as well as the change.

**Decision**: a request is authenticated by the signed `gachard_session` cookie and by nothing else. `getAuthenticatedUser()` has no fallback. The gate verifies the same HMAC for protected pages that it already verified for APIs. Logging out is a server round trip. Public endpoints do not emit user identifiers.

**Reason**: the previous arrangement was not a weak check, it was an open door, and it is worth recording exactly how the pieces combined — no single one of them looks alarming on its own.

`getAuthenticatedUser()` accepted a bare `gachard_uid` cookie and looked the user up by it, commented as a fallback for "pre-session-auth users". That cookie was written by client script in `app/login/page.tsx` and carried no signature. The middleware accepted it too, for APIs and for pages. So setting one cookie to a user's MongoDB ObjectId made you that user completely: read their collection, spend their credits, list or dismantle their cards, move cards to a Privy wallet. Not a shell, not a stale view — full authority.

The ids were not secret. `GET /api/marketplace/listings` is in `PUBLIC_API` and returned `{ ...listing }` with nothing removed, and a listing document carries `sellerId`, which is `user._id.toString()`. Anyone could open the marketplace unauthenticated, read a seller's id, set a cookie, and be them. The attack needed no credentials, no interception and no guessing.

**Verified before and after**, against a throwaway user, not by reading the code: with only `gachard_uid` set, `/api/cards` returned the full collection and `/api/user/advanced` returned the account's settings. After the change both return 401, a forged signature returns 401, protected pages redirect, and a genuine session still works.

**Two consequences that had to be fixed in the same change, because the first one broke logout and the second one was the leak itself:**

**Logging out never ended the session.** `handleLogout` cleared localStorage and the uid cookie, which was enough only because pages were gated on that cookie. `gachard_session` is httpOnly by design, so script cannot clear it; the browser stayed authenticated to every API after "Log out". This was already true before this ADR — tightening the page gate merely made it visible. `POST /api/auth/logout` now expires both cookies server-side.

**Public responses stop carrying identifiers.** `sellerId`, `sellerWalletAddress` and the raw `_id` are removed from the listings response. The UI only ever needed "is this listing mine", so the server computes an `isOwn` boolean instead; the seller's id never reaches the browser. The wallet address is a separate harm and would be worth removing even without the takeover: ADR-002 says a user never sees a wallet address, and publishing the seller's lets anyone read that person's entire on-chain collection starting from a listing.

**The rule this leaves**: a public endpoint returns a document only through an explicit field list or an explicit removal. `{ ...doc }` from a collection is how this happened, and it will be how it happens again.

**Amendment, 23 September 2026: an explicit field list is not enough if the list itself names people.**

The rule above was being followed and still leaking. The public admin endpoints all built explicit objects — and those objects named `email`, `recipientName`, `phone`, `addressLine1`, `postalCode`, `ownerAddress`, `ownerUsername`, `userId` and the decrypted `redeemCode`. Verified against production with no credentials at all: `GET /api/admin/print-requests` returned a real email address, and the schema publishes a recipient's name, phone number and home address for every print request made.

The redeem code was the worst of them. Redemption sends the card to whoever is logged in when the code is entered (ADR-007) — deliberately, because a physical card can change hands, which makes the code the bearer credential for that card. Publishing it beside the card id handed the card to anyone who opened the URL.

**Decision**: the admin console answers two audiences from one address. The flow is public — token, card, rarity, status, whether a redeem code exists and whether it has been accepted, the whole print-to-approval walkthrough the console exists to show. The people in that flow are not. `proxy.ts` already verifies the admin cookie, so it now states the result in an `x-gachard-admin` request header, and routes include the personal half of their field list only when it is set. The header is deleted from every incoming request before the gate sets it; otherwise sending it by hand would be indistinguishable from the gate's own word.

Fields are omitted rather than nulled. Absent is the honest shape: not withheld pending something, simply not sent.

**Consequence**: this is a second tier, not a second gate. Nothing that was public became private — `/admin` and its read-only routes still answer a stranger, which is the whole reason the console is open (ADR-032 did not cover this; the admin console tiering was added on 22 September and this completes it).

**Verified**: 68 suite checks, six of them new — each public admin endpoint carries none of ten personal keys, a forged `x-gachard-admin` header is ignored, and an authenticated admin still receives the fields.

**Consequence, migration**: none for current users. Both Google (`api/auth/google`) and demo (`api/auth/demo`) login already issued the signed httpOnly cookie, so the fallback was serving nobody. A browser carrying only the uid cookie is asked to sign in again.

**Consequence, one mechanism to reason about**: pages and APIs are now gated identically. The earlier split — signed token for APIs, cookie presence for pages — is the kind of asymmetry that reads as deliberate and is easy to extend wrongly. Any page that renders server-side data now sits behind the same verification the data does.

**Amendment, 12 October 2026: a derived identifier is still an identifier.**

The rule above says public endpoints do not emit user identifiers, and `/api/scan` complied in letter: it returned `username`, not an id. But `lib/auth.ts` builds `username` as `email.split("@")[0]`, so every scan published the owner's email address minus its domain. The endpoint is public by design (provenance is the point of it) and a cardId is five hex characters, so the full list of owners could be collected by script without holding a single physical card.

**Decision**: public surfaces show a collector by a name they chose, or by an anonymous label — `Collector #3F9A2C`, an HMAC of the user id that is stable across cards and not reversible to the id. `username` does not appear in any public response. A raw wallet address does not either: an address that matches no Gachard user reads "Unknown holder", because this is a consumer surface (ADR-002).

Names are ASCII-only and some are reserved, because a collector named "Gachard Vault" could make a provenance row look like the platform held a card it never did, and a Cyrillic а passes any blocklist written in Latin letters — ADR-033's impersonation problem by another door. Names are unique case-insensitively, because the reason to show a name is to say who held a card, and a shared name says nothing.

A name can be made private. Scans then show the anonymous label, but the name stays reserved: hiding a name and giving it up are different acts, and a collector who goes quiet for a week must not come back to find someone else wearing their name on every card they ever held.

**A name is chosen once.** It is how other collectors recognise who held a card, and a name that can be changed at will can be passed around, or worn until it has a bad history and then dropped. Renaming needs a grant on the account (`nameChangeGranted`), set by hand for now, and a grant allows exactly one change: the conditional write that makes the change also removes the grant, so two requests sent together cannot both use it. Releasing needs the same grant, because releasing and claiming again would be a rename. Private and public stay free to toggle, because they change who sees the name, not the name.

The username no longer appears anywhere in the app's own UI either. The profile header and the navbar show the public name, or `Collector #…` until one is chosen, with the collector label under a chosen name. That label is an HMAC of the internal user id under a server secret: not derived from the wallet address or the email, and not reversible to either.

The admin console follows the same rule through `adminLabel()`: the public name, or the collector ID until one is chosen. It shows the name even while it is private, because private hides a name from strangers, not from the operator. The Users panel lists both the name, with its Public/Private state, and the collector ID. Both appear only behind the admin sign-in, as the users' other details already did.

The rule this leaves, sharper than the one above: **a field derived from personal data is personal data.** Check what a public field is made of, not just what it is called.

**Note, 23 September 2026: the gate moved from `middleware.ts` to `proxy.ts`.**

Next 16 deprecated the `middleware` file convention and renamed it to `proxy`, and the build said so on every deploy. The file was renamed and the exported function with it; `config.matcher` is untouched. Nothing above changes — this is the same gate under the name the framework now uses, and everything this ADR says about it still holds.

One thing is genuinely different, and it is a constraint on whatever is added next: a proxy always runs on the **Node.js runtime**, and setting the `runtime` config option in that file throws. The old file ran on Edge, which is why the HMAC is verified with Web Crypto and the Basic header decoded with `atob` rather than `Buffer`. Both work on Node, so nothing needed rewriting, but the Edge constraint that shaped this code is no longer the reason it looks the way it does.

Verified after the rename, not assumed: all 46 checks in `scripts/suite-api.ts` pass, the three admin tiers still answer 200 / 401 / 401 as before, and `POST /api/admin/unlock` still reaches its own handler rather than being refused by the gate — without that exemption nothing could ever be unlocked.

## ADR-033: Token Metadata Is Left Empty, Deliberately

**Status**: Accepted, 25 September 2026

**Decision**: `GachardCard` returns an empty `uri()` for every token, and no metadata endpoint exists in the app. A Gachard card renders as an unnamed, imageless item in any wallet or marketplace outside Gachard. This is a decision, not an unbuilt feature.

**Reason**: three.

**Nothing outside Gachard can render a card, so trading comes back to Gachard.** A card whose artwork, name and rarity are invisible is a card nobody bids on elsewhere. This is what makes a marketplace fee collectable at all: not a rule, just the absence of a reason to go anywhere else.

**It is not needed yet.** OpenSea does not index Monad Testnet, so on the chain this project runs on, no external surface would render these tokens regardless of what `uri()` returned.

**It keeps the anti-impersonation rule categorical.** Fake collections built from stolen artwork are the standard scam on open marketplaces, and this product's stated audience — collectors who are not crypto people (ADR-002) — is the population least equipped to spot one. With no official collection anywhere outside Gachard, the rule a new user has to learn is one sentence with no exceptions: *Gachard cards only exist in Gachard; anything that looks like one elsewhere is fake.* Compare that with what the alternative asks of them — check the verified badge, match the contract address, compare item counts and deploy dates — which is precisely the competence this product exists to not require. It is the same shape as "we will never email you asking for your password", and it is strong for the same reason: no exceptions to reason about.

Two things must be said plainly alongside it, or this reason will be misremembered as something it is not.

**It does not protect the artwork.** The images are public and have to be — a card game whose players cannot see their cards is not a product. `frontend/public/cards/*.webp` is served directly, `/api/cards` returns `artworkUrl`, and this was verified against production with no credentials: `GET /_next/image?url=/cards/common-1.webp&w=640` returns 200 and 39,721 bytes of AVIF. Anyone minting a counterfeit collection downloads the art from the website in seconds; an empty `uri()` raises the cost of that by nothing. Do not write, or say, that empty metadata prevents art theft. It is disprovable in ten seconds and it would take every other claim down with it.

**It cedes the search results.** Because the genuine collection is absent from external marketplaces, the only Gachard-looking tokens there are the counterfeits — with no official collection beside them to compare against, no verified badge, and nothing authentic ranking above them. A verified official presence is itself one of the standard defences against impersonation, and this decision forgoes it. The bet is that a rule with no exceptions protects a non-crypto user better than a badge they have to know to look for. That bet is defensible; it is still a bet, and this is the cost side of it.

What actually raises the cost for an impersonator is elsewhere, and should be built rather than assumed: the physical card, which no counterfeiter can print and post; the contract address as the one identity anchor that cannot be forged, already verified on Sourcify and already published; and a verification surface that makes the categorical rule checkable rather than merely asserted — `/scan` already exists for cards, and extending it to answer "is this collection ours?" is small work for a large gain.

**The reason this is NOT**: preserving the ability to fix or update artwork. That reasoning was considered and is wrong, and it is written down here because it is the plausible-sounding explanation a future reader would otherwise invent.

What a contract stores is the *address*, not the image:

```
contract  →  "https://gachard.com/api/metadata/{id}"
that URL  →  { "name": "...", "image": "https://gachard.com/cards/legendary-1.webp" }
```

Only the first line is on chain. The JSON is served by our own server, so artwork changes by replacing a file — no transaction, no gas, no redeploy. The arrangement that genuinely locks artwork is an IPFS content hash (`ipfs://Qm…`), where changing a pixel changes the address. Projects choose that deliberately, to prove the art cannot change. Our need is the opposite, so if a URI is ever set it points at our own HTTPS endpoint, never at a content hash.

**Consequence, and it is the sharp one**: this is not reversible on the deployed contract. `constructor() ERC1155("") Ownable(msg.sender) {}` — there is no `setURI`, no `uri()` override, no base URI anywhere in `GachardCard.sol`. The URI is permanently the empty string. Changing this costs a new contract, and one dead contract (`0x712b70…`, ADR-026) is already the price of a previous migration.

So the current state is the *least* flexible option available, which is the reverse of what "keep our options open" would have produced.

**Consequence, what this does and does not stop**: it stops display, not transfer. An exported card is `Digital` on chain, and `_update()` only blocks transfers while `Vaulted`, so its holder can list and transfer it anywhere they like — it simply renders blank. The honest sentence is "nobody buys a blank square", not "it cannot be sold elsewhere". Do not claim the stronger one.

**Consequence, the three reasons are not equally strong, and the pitch should not treat them as one thing.**

The *commercial* reason — trading comes back to Gachard because nothing renders elsewhere — is the weak one, and should not be pitched as the moat. It works by withholding something the card's owner wants: collectors like seeing their cards in their wallet, and that is part of owning one. A moat that depends on withholding loses to the first competitor who stops withholding. The durable commercial moat is the physical card, which no marketplace can print and post, and that is what a pitch should lead with.

The *safety* reason stands on different ground and does not depend on the commercial one being true. It is not about keeping value in; it is about keeping a rule simple for someone who cannot evaluate a badge. It would still be worth something even if the fee were abolished tomorrow, and it survives the objection above because a user who is spared a counterfeit has not been withheld from — they have been protected from a thing they could not have spotted.

Keep them separate when speaking. Collapsing them into "we hide the metadata so people trade with us" throws away the reason that is actually defensible.

**Consequence, for whoever deploys the next contract**: include a `setURI(string)` guarded by `onlyOwner` and a `uri()` override built from it. That keeps both the metadata *and* its location changeable, which is what flexibility actually looks like. Leaving the constructor argument empty and adding no setter, as here, keeps neither.

**Do not "fix" this.** An empty `uri()` reads like an oversight, and adding `app/api/metadata/[tokenId]` is half an hour's work that looks like an obvious improvement. It would dissolve the first reason and the third at once — the fee stops being collectable, and the one-sentence rule a non-crypto user relies on acquires an exception. If that trade is worth making later, amend this ADR; do not make it by accident while tidying.

**Related**: the marketplace model where a card is exported to the user's own wallet before sale is now **ADR-034**, which also records why it cannot collect a fee today. Read the two together before adding metadata: a Gachard-run marketplace renders cards from its own database and does not need `uri()`, but external liquidity would, and at that point these two ADRs conflict.

## ADR-034: The Marketplace Fee Belongs to a Self-Custody Marketplace, Which Is Not Built

**Status**: Proposed, 25 September 2026. **Nothing in this ADR exists in code.**

**Decision**: a marketplace fee is charged only where it can actually be collected — on a marketplace for cards held in the user's own wallet, priced in something spendable. The fee is removed from Crystal trades entirely (ADR-024, amended) rather than left in place as a placeholder.

**Reason**: the previous arrangement charged a fee in a currency that cannot leave the system, so the fee was a cost to sellers and nothing to the platform. Keeping it "for later" would have meant charging real users for a revenue line that could not arrive, and the pitch material had already started describing it as income.

**The shape this would take**, recorded so the gap is visible rather than assumed away:

A seller exports the card to their own Privy wallet (ADR-031), then lists it on a Gachard-run marketplace. The fee is taken by the contract that performs the sale.

**What is missing, and it is the whole thing:** there is no such contract. `marketplaceTransfer()` is `onlyOwner` and moves a card between two custodial addresses — it works because Gachard holds the token. Once a card is in a user's own wallet, Gachard has no authority over it at all, by design, which is the entire point of ADR-031. Collecting a fee from a sale of a card the platform does not hold requires either escrow (the seller deposits the card, the contract releases it to the buyer and keeps a cut) or an approval-based model (the seller approves the marketplace contract, which transfers on a matched order). Both are new Solidity, new audits' worth of risk, and a new deployment.

**Three consequences that have to be accepted, not discovered later:**

**The fee cannot be in Crystal.** A fee that the platform can spend has to be in something the platform can spend — MON, a stablecoin, or fiat off-chain. That is the step ADR-026 deliberately avoided: it opens money-transmission and securities questions that were sidestepped precisely by making Crystal unpurchasable and unredeemable. This is not a technical decision dressed as a legal one; it is a legal decision that happens to need code.

**It sits above the free tier, and that laddering is the point.** The Crystal marketplace charges nothing and needs no export, no wallet and no signature (ADR-024, amended). This one charges a fee and requires all three. That is not the same product with a toll added: what the seller buys with the friction is real liquidity — a buyer paying in something spendable, and a card that can leave Gachard entirely.

The test this has to pass is therefore not "is it cheaper than the free tier" but "is what it adds worth exporting for". If the answer is ever no, the fee is not the problem and lowering it will not help; the tier has nothing to sell. Keep the free tier genuinely free for that reason — the moment an in-app Crystal swap carries a fee, the ladder collapses into one grudging product with two prices.

**It reopens the metadata question.** ADR-033 leaves `uri()` empty partly so that nothing outside Gachard renders a card. A Gachard-run marketplace for self-custodied cards is still Gachard, so it can render them from its own database without any on-chain metadata, and ADR-033 holds. But if the intent ever becomes *external* liquidity, that requires metadata, and the two ADRs then genuinely conflict. Read them together before choosing.

**Not decided here**: whether to build this at all. Pack sales and the flat print fee are the revenue lines that exist. This ADR exists so that "the marketplace fee" has one honest location instead of being quietly true in the code and loudly wrong in the pitch.

## ADR-035: A Cosmetics Store Is the Intended Crystal Sink

**Status**: Proposed, 25 September 2026. **Nothing in this ADR exists in code.**

**Decision**: when Crystal needs a sink, it is a Gachard-run store selling **cosmetic items** — card frames, display cases, profile decoration — and nothing else. Not cards, not packs, and nothing that touches odds or gameplay.

**Reason**: removing the marketplace fee (ADR-024, amended) left Crystal with no sink at all. Dismantling creates it; trading only moves it between users, because every listing is created by the card's owner and Gachard is never the seller. So the pool only grows.

A store is the right shape of sink because it is **chosen, not charged**. The fee it replaces was a tax on the one activity the marketplace exists to encourage, and worse, a tax on the compensation for a bad pack. A store takes Crystal only from someone who decided they wanted something more than they wanted the Crystal.

It also gives Crystal a second use. Today a duplicate is only worth something if another player happens to be selling a card you want; the value of dismantling is hostage to the state of one market. A store makes Crystal useful on its own.

**Why cosmetics specifically, and not the tempting alternatives:**

**Not cards.** Gachard selling cards for Crystal would make the platform a seller in its own peer-to-peer market, which is exactly what the marketplace is not (ADR-024). It would also mint cards out of Crystal, so dismantling would stop being a net card sink and the two pools would decouple.

**Not packs.** Packs are bought with Credits, which is the main revenue line. Selling them for a currency earned by destroying cards would cannibalise it in the one place the business actually earns.

**Nothing that affects odds or play.** A currency earned by destroying your collection must never buy an advantage, or the game quietly pressures people to dismantle cards they wanted to keep.

**Consequences that have to be accepted, not discovered:**

**The store sets a price floor for Crystal.** Once a frame costs 800 Crystal, that number anchors what Crystal is worth, and the card market prices itself against that anchor. Pricing the store is an economic decision with effects outside the store, not a design detail to be settled by whoever builds it.

**It costs real money and earns none.** Cosmetics need artwork, and the artwork is paid for in cash to create demand for a currency that cannot be cashed out. The return is retention and a duplicate loop that stays meaningful — real, but indirect. Anyone proposing this as revenue has misread it.

**A good store makes people dismantle more.** That is the point and also the risk: dismantling is a card sink, so an attractive store accelerates the destruction of cards, including ones their owners would otherwise have kept. Watch the dismantle rate after launch rather than assuming the effect is small. If collectors start stripping their collections for frames, the store is priced wrong.

**Cosmetics stay off-chain.** They are display, not property. Keeping them out of the contract avoids the metadata question entirely (ADR-033) and keeps them cheap to add, change and retire — which is what a cosmetics catalogue needs and what a token is bad at.

**Not decided here**: whether a sink is needed yet. With the database clean-slated there is nothing accumulated to drain. This ADR exists so the shape of the answer is settled before there are thousands of users holding large balances, because adding a sink later reads as confiscation to everyone who is already rich.

## ADR-036: What a Compromised Admin Key Can Do, and What We Are Doing About It Now

**Status**: Accepted, 7 October 2026. The findings describe the **deployed** contract. The remedies are split between what ships this week and what waits for the next contract.

**Decision**: do not redeploy before the hackathon submission. Write down exactly what an attacker holding the admin key could do, prepare the emergency response, add one detection check, and fix the contract properly afterwards.

---

### What the key can do today

The admin wallet is `owner()` of `GachardCard`. Read from the source rather than assumed:

```solidity
function marketplaceTransfer(uint256 tokenId, address from, address to) external onlyOwner {
    require(cardStatus[tokenId] == CardStatus.Digital, "Card is not digital");
    require(balanceOf(from, tokenId) == 1, "Sender does not own card");
```

No signature from the holder. No evidence that a sale happened. Whoever holds the key can move **any Digital card from any address to any address**.

**That includes cards in users' own Privy wallets.** An exported card is `Exported` in MongoDB but still `Digital` on chain — only `Vaulted` blocks transfers in `_update()`. So the self-custody path does not currently protect a card from Gachard's own key. That contradicts what ADR-031 promises the user, and it is the most important finding here.

`Vaulted` is no safer. `redeemCard` compares its argument against `storedHash[tokenId]`, and that mapping is declared `public` — an attacker reads the hash off chain and passes it straight back. Knowing the physical redeem code is not required.

`burnCard` destroys any Digital card. `mintBatch` mints without limit. `setAuthorizedMinter` grants minting to anyone. `transferOwnership` locks us out permanently.

**Role separation is not available on this contract.** Of the seven functions the backend calls with the admin key, five are strictly `onlyOwner` — `requestPrint`, `redeemCard`, `marketplaceTransfer`, `recordVerification`, `burnCard` — and all five sit on the ordinary request path. Only `mintCard` and `mintBatch` accept the `authorizedMinters` role. The daily key therefore *must* be the owner. Any advice to "give the daily key limited permissions" needs a new contract; it cannot be done by configuration.

### What the key cannot do, and why

A token minted straight to an attacker's address is **worthless inside Gachard**.

Every action starts from a document in the `cards` collection. Dismantle returns 404 without one, then 403 unless `card.ownerAddress` matches the caller. Listing checks the same document. The only production path that creates one is `/api/mint`, which requires a session, deducts credits and goes through PackEntropy — and nothing anywhere creates a card row by observing the chain, including the reconcilers, which only ever `updateOne` documents that already exist.

So an attacker cannot mint cards and then sell them, dismantle them for Crystal, or print them. The database is an unplanned but real second gate.

This is stronger than a freeze list, and a freeze list should not be built: a block list has to be noticed and maintained, and would be a second mechanism that can disagree with the first. These cards are not blocked — they were never admitted.

**The condition this rests on**: the key alone is not enough, but the key *and* the database is. Both live in the same Vercel environment today. They must not leak together, and that is a real weakness rather than a theoretical one.

### The split that decides what can honestly be promised

**Custodial cards cannot be protected from a platform compromise.** Gachard holds those keys, encrypted at rest (ADR-020). Whoever obtains `ENCRYPTION_SECRET_KEY` and the database holds the cards, whatever the contract says. That is what custody means, and it is not a defect to be engineered away.

**Self-custody cards can be, and are not.** Privy holds those keys, not Gachard. The contract hands them over anyway. This is the gap worth closing, because it is the only promise that can be kept completely.

---

### Shipping this week

**The emergency playbook.** The first response to a detected compromise is **not** a new contract — it is calling `transferOwnership()` to a cold or multisig address the attacker does not control, on **both** contracts. PackEntropy is `Ownable` too and its `requestPack` is `onlyOwner`, so a key that can no longer touch cards can still loop it and burn the entropy budget. Its balance cannot be stolen — there is no withdraw function — only spent to nothing.

And freezing is not fixing: ownership must never be handed back to the key that leaked. A new hot key is generated, the whole environment is rotated rather than that one value, and the cold address holds ownership only long enough for the swap. Ownership also does not revoke minting rights, since `authorizedMinters` is a separate mapping — an address granted before the freeze keeps it, and this RPC caps `eth_getLogs` at 100 blocks, so unknown ones cannot be enumerated cheaply. That is one more argument for enumerable roles in the next contract. We still hold the key too. Winning that call strips the attacker of every `onlyOwner` function at once, including the ability to add themselves as a minter, and nothing needs migrating.

It is a race, and whoever calls first wins permanently. That is exactly why detection speed decides the outcome: it determines whether we are in the race at all. **The destination address is chosen and recorded in the runbook before it is needed**, because a transaction whose address is already known is far faster than a decision taken in a panic.

**Supply integrity check.** `nextTokenId` is public and the card count is a query. A sudden gap between them is rogue minting, visible in minutes. One check, no contract change, alongside the MON balances the admin console already watches.

*As built, 7 October 2026:* the comparison is against a high-water mark, not the card count or the mint records. The first version counted mint transactions, and it fired in production within an hour — clean-slate and test fixtures delete those rows while the tokens stay on chain, so Gachard's own mints read as unexplained. Token ids are sequential, so one number settles it: the highest id Gachard has acknowledged, kept in `chain_baseline` (which nothing deletes) and advanced by the fulfil path with `$max`. Anything the chain has issued above it is unexplained.

**This ADR.** For a project with one user on testnet, the written record is the mitigation that pays. Exposure today is zero; the submission is in a week. Being able to answer "what if your admin key leaks" with the code, the gap, the fix, and the reason it has not shipped yet is worth more than a rushed contract.

### Not shipping this week

A new contract. One week to the deadline, a demo still unrecorded, and one dead contract (`0x712b70…`) already paid for in a previous migration. Exposure is a single testnet account holding nothing of value. Redeploying now trades a mapped risk for an unmapped one, and takes its hours from the recording.

### The next contract, in priority order

**1. `marketplaceTransfer` requires an EIP-712 signature from the holder.** This is the one that matters. It converts "the damage is bounded" into "the theft is impossible", and it makes ADR-031's promise true. The pattern already exists in this codebase as `ExportBatch` in `lib/export-intent.ts`. After it, a leaked key can still mint, burn unsold inventory and spend gas — it cannot take a card someone holds in their own wallet.

**2. `AccessControl` instead of a single owner.** A minter role, a fulfilment role, an admin role. The hot key carries only what the request path needs; the owner key goes cold.

**3. Timelock on the administrative functions only.** `setAuthorizedMinter`, `burnCard`, `transferOwnership`. A compromised key can then only queue, and a queued action can be cancelled — the race becomes a two-day window.

It cannot cover the operational functions. `requestPrint`, `redeemCard` and `marketplaceTransfer` run on the user's request path under a ten-second budget (ADR-018); a timelock there means a buyer waits two days for their card. Advice that applies a timelock uniformly has not looked at where these functions are called from.

**4. On-chain rate limits.** A daily cap on `burnCard` and `mintBatch`. A leaked key still does damage but cannot drain everything in one block — which protects us while nobody is watching, without needing to win any race.

**5. A guardian role holding `pause()`**, on a cold key separate from operations. **Not** loosely accessible: a pause anyone can call is a button that stops the platform, and someone will press it for fun.

### Rejected

**Soft burn** — making dismantle reversible. The cost is not architectural purity, it is the credibility of the Crystal economy: every Crystal in existence corresponds to a card that was genuinely destroyed (ADR-026, and ADR-024 as amended), and the README promises a permanent on-chain burn. Reversibility unties Crystal from scarcity.

**`Ownable2Step` as a security measure.** It prevents mistyped addresses, not theft — an attacker controls the destination and can accept the transfer themselves. Worth having; not a mitigation.

### Recovery, if the race is lost

A new contract returns nothing. Stolen tokens stay on the old contract at the attacker's address, and the attacker keeps the old key and can go on minting there forever. What a migration really means is **re-minting** equivalents to the rightful owners, which requires knowing who they were **before** the compromise — so an append-only, tamper-evident ownership snapshot is what recovery actually depends on. Not as evidence, but as the only trustworthy source to re-mint from, since the live database may have been written to by the attacker.

And the cost that is easiest to overlook: **re-minting is a custodial act**. A user who exported to their own wallet precisely so Gachard could not touch their card would end up holding a worthless token on a dead contract, needing to trust Gachard to issue a replacement. The self-custody promise inverts at exactly the moment it matters most. That is the strongest argument for remedy 1 above, and for treating a second dead contract as a genuine last resort.

### Consequence for the submission

This is stated in the submission rather than hidden. A project that can describe its own worst case precisely is more credible than one claiming not to have one — and that claim would not survive anyone reading `marketplaceTransfer`.

## ADR-037: Find Anomalies by Checking State, and Log Only What State Cannot Show

**Status**: Proposed, 12 October 2026. Check 1 is built (see the note at the end); the rest is not. It waits until after the submission deadline (14 October), with one possible exception named at the end.

**Context**: the suggestion was to add logs and tracing so anomalies can be found. Before deciding, it is worth looking at how this project's real anomalies were actually found.

Four of them came up in a single week of October 2026:

- A Privy send was recorded as done with no transaction hash.
- A marketplace purchase hung forever, because the `pending*` fields it wrote were never read by anything.
- A card sent back into a Gachard wallet from outside was never noticed.
- The first supply monitor raised a false alarm, because it counted rows that cleanup had deleted.

None of these would have shown up in a log. No request failed and no error was thrown. Each was **data in a state it should not be in**, and each was found by someone reading the database and the chain by hand.

What exists today:

- `transactions` already serves as an audit trail for mints, trades, transfers and purchases.
- The admin console has a Pending Cards panel (`/api/admin/pending-cards`), but it covers stuck mints only.
- The Token Supply Integrity panel (ADR-036) watches for minting nobody accounts for.
- Application logging is about 108 unstructured `console` calls. They live only in Vercel's runtime logs, which are kept for a short time and cannot be queried for patterns.
- There is no logger, no error tracker and no tracing library.

**Decision**: anomalies are found mainly by **checking state**, with a small structured event log for what state cannot show. Distributed tracing is not adopted.

**1. State checks, shown in the admin console.** These follow the pattern of the supply panel: each check is a query that answers "is anything in a state it should not be in?" and shows a count, then the rows. In order of value:

1. *Stuck in pending.* Any transaction, card or listing still `pending` after 10 minutes. This widens the Pending Cards panel to cover purchases (`pendingBuyerId`), Privy sends and imports.
2. *Done without proof.* A confirmed on-chain action whose transaction has no `txHash`.
3. *Database and chain disagree.* A card whose recorded owner does not hold the token on chain. This samples rather than sweeps, because every check is an RPC read.

**2. A structured `events` collection, for the few things state cannot show.** These are failed or refused requests, which change nothing and so leave no state behind:

- authentication refused
- rate limit hit
- admin console unlocked
- mint, fulfil or refund failed

Each event holds a type, a timestamp, a user id or hashed IP, and an optional reference id. It holds **no email, username or wallet address** (ADR-032: a field derived from personal data is personal data). A TTL index removes events after 30 days. The anomaly signal is a spike in rate rather than any single event, for example many refusals from one source within a minute. The admin console shows counts per hour.

The `console` calls stay where they are. The events log does not replace them; it is the part someone can query.

**3. No distributed tracing.** Tracing earns its cost when one request crosses many services and it is unclear where time or failure went. Gachard is one Next.js app, one database and one chain. An OpenTelemetry setup would add a dependency and a collector to run, and it would not have caught any of the four bugs above. Reconsider when there is a second service.

**Why not a hosted error tracker (Sentry and similar) first?** It is cheap to add and useful for crashes. But a crash is the one kind of failure this project has rarely had: the bugs that mattered looked like success. It is a reasonable later addition, not the first one.

**Consequences**:

- A state check can only find what someone thought to check for. The four checks above are the anomalies already seen; a new kind of failure will still be found by hand the first time, and should then become a check.
- Check 3 costs RPC reads. If the RPC is down, the check reports "unknown" rather than "all clear". It must never report "all clear" when it could not look.
- The events collection is new personal-data-adjacent storage. A hashed IP is still linkable within the TTL, which is why the TTL exists.

**Possible exception before the deadline**: check 1 alone, as a wider Pending panel. It is a query against data that already exists, needs no schema change, and catches the class of bug that has cost the most time. Everything else waits.

*As built, 12 October 2026: check 1 shipped.* It is a separate "Stuck in flight" panel rather than a widened Pending Cards panel, because the existing panel is a detailed view of mints and this one has to cover every flow (`lib/in-flight.ts`, `/api/admin/in-flight`).

- **Transactions are the primary source.** Every flow that can hang writes a `pending` or `entropy_pending` transaction row before it waits, so one stuck operation is one line.
- **Cards appear only when their transaction is not pending.** Otherwise one problem would be counted twice. A card still in flight while its record says confirmed is the stuck-purchase bug exactly, and it is the row this panel most exists to show.
- **Its "in flight" for a card is the reconciler's definition.** It uses the same conditions as `lib/privy-reconcile.ts` (`importTxId` without `importTxHash`, `releaseTxId` without `releaseTxHash`), so the two cannot disagree about what is unfinished.
- **It reads the database only.** That keeps it separate from `/api/admin/balances`, which fails whole when the RPC is down — and a dead RPC is when operations pile up.
- **It is public tier and names no user.**
- **It lives in a folded System Health section** with the balances and the supply check, closed by default. The closed header carries one line of status and any alarm opens it on load, so folding saves space without hiding a problem.

Checks 2 and 3 and the events log are still not built.

## ADR-038: The Store Sells Only What the Buyer Has Already Seen; Seasons, Albums and Limited Cards

**Status**: Proposed, 13 October 2026. **Nothing in this ADR exists in code.** When built it supersedes ADR-021 and ADR-035, and amends ADR-009, ADR-026 and ADR-029. The contract migration (new admin wallet, new contracts) is on hold until this is final, because it decides what the next contract must contain.

**Context**: a paid random pack is the shape regulators call gambling. The usual test has three parts — the player **pays**, the outcome is **random**, and the prize has **money's worth** — and Gachard as built meets all three. Credits are bought with money (ADR-008), rarity is drawn from a Pyth seed (ADR-029), and the cards have value outside the app: they can be exported to a self-custody wallet and sold (ADR-031) or printed as a physical card. Crystal being non-cashable (ADR-026) does not help, because the prize is the card, not the Crystal.

Jurisdictions differ and this is not legal advice; the picture below is from general knowledge and must be checked per target market before launch. Belgium has treated paid loot boxes as gambling since 2018. Japan has banned *kompu gacha* — a rare reward for completing a set drawn at random — since 2012. China and South Korea require published odds. Australia gives games with paid loot boxes a minimum M rating. The Netherlands' ban was overturned in 2022. The United States, the beta market, has no federal rule.

**Decision**: remove the random step from every purchase made with money, and keep the surprise by making the reveal free. Randomness decides what a user is *offered*; the user decides what to *buy* after seeing it.

### 1. The store

- **Per user.** Every user has their own store of **3 packs**. A global store would be emptied by bots in seconds and would make Expansion meaningless.
- **Rotates every 6 hours.** Unbought packs disappear at rotation.
- **Revealing is free and done card by card.** A pack is opened one card at a time without buying it. That is the surprise the product keeps. Buying happens after.
- **Nothing that depends on a pack's contents is shown before the pack is fully revealed.** Decided 14 October 2026, while designing the store screen. A pack's price is the sum of its cards' prices (section 2), so a price shown early gives the contents away: 2,400 can only mean a Legendary is inside. That would make Detection free and the reveal pointless. So:
  - a pack's **price, dismantle value and rarity summary** appear only once all five of its cards are revealed;
  - the **shelf price** appears only once every pack on the shelf is fully revealed;
  - a pack can only be bought once it is fully revealed, which is the rule this ADR is built on stated literally: the buyer pays only for what they have seen.
- **What was revealed is exactly what is bought.** Store contents are fixed before anything is revealed (see ADR-029 below), so the server cannot swap a card between reveal and purchase.
- **Minting happens on purchase only.** A revealed pack that nobody buys costs no gas and leaves nothing on chain.
- **A refresh is never sold for money.** Paying Credits for three new random packs is buying a gacha pull, and it would bring back the exact thing this ADR removes. The wait for the next rotation is part of the design: there is always something to come back for.

### 2. Pricing

Pack prices are **not flat**. A pack costs the sum of its cards' prices by rarity. With a flat price and visible contents, users buy only the good packs and the ordinary ones never sell.

The ordinary packs are made worth buying on their own terms, as the cheapest source of Crystal:

| Rarity | Card price (illustrative) | Dismantle yield (ADR-026) | Crystal per 100 Credits |
|---|---|---|---|
| Common | 100 | 20 | **20** |
| Rare | 300 | 50 | 16.7 |
| Epic | 800 | 120 | 15 |
| Legendary | 2,000 | 300 | 15 |

The numbers are placeholders for tuning; the shape is the decision. Crystal per Credit is **highest on the cheapest cards**, so a pack of Commons is the efficient way to Crystal rather than a leftover.

- Each fully revealed pack shows its **dismantle value** ("Dismantle value: 140 Crystal"), so buying it for Crystal reads as a rational choice.
- **Buying the whole shelf carries a 15% discount**, so a user who wants one pack has a reason to take the others. Decided 13 October 2026:
  - **How it applies: the whole shelf in one transaction.** Decided 13 October 2026, replacing the "complete the shelf" rule recorded earlier the same day. The discount is earned only by buying every pack on the shelf in a single purchase. A pack bought on its own is full price, and the packs left after it can no longer earn the discount in that rotation. That is the intended trade: the discount rewards the decision to take the whole shelf, not a top-up afterwards. Because of it, the store must show the shelf price beside every single-pack Buy button ("This pack 2,400 · whole shelf 3,060, save 540") so nobody loses the discount by not knowing it was there. Before the whole shelf is revealed, that place shows "Reveal every pack to see the shelf price" instead of a number.
  - **The discount needs the whole shelf: 3 packs, or 5 with Expansion.** With Expansion, buying 3 or 4 of the 5 earns nothing. The rate is 15% in both cases. A whole-shelf purchase mints every card in it in one batch.
  - **A Reserved pack does not count toward the next rotation's shelf.** Otherwise Reserve could merge two rotations into one discount.
  - **A pack holding a limited card is discounted like any other.** Excluding it would mark it in the price, which would give away what Detection is sold for.
  - **It is a discount on goods in view, not on a chance**, so it does not touch the first of the lines this ADR does not cross.
  - **The discounted Common shelf sets the cheapest price of Crystal in the game.** Every Crystal item is priced against that number: too cheap and the Wish Card stops being a net card sink, too dear and the cheap packs stop selling. With Expansion the shelf is 5 packs, so one completed shelf yields more discounted Crystal; Expansion is priced with that in view.
- **Album cards are mostly Common and Rare** and appear in ordinary packs, so a cheap pack can hold the one card an album is missing.

### 3. What Crystal buys

Crystal is still created only by dismantling. Every item below is bought **with Crystal only, never with Credits**.

- **Expansion**: 2 extra store slots (5 packs in total), for a limited time (7 or 30 days). Never permanent.
- **Detection**: marks which unrevealed packs hold a high-rarity card, so the user reveals only the ones that matter. Pure convenience, since revealing is free anyway. It never shows a price: a marked pack still has to be revealed in full before it can be bought.
- **Wish Card**: the user picks one card to complete an album. Priced well above what the same card yields when dismantled (for example 1,500 Crystal for a Legendary that dismantles for 300), so every Wish Card destroys more cards than it creates and dismantling stays a net card sink. **A Wish Card cannot select a limited card.** **The card goes straight into its album slot and is locked there** (amendment of 15 October 2026).
- **Reserve**: holds one pack past rotation for 24 hours. It answers the pressure of the 6-hour clock without changing the rules.
- **Wishlist Alert**: notifies the user when a card on their `/wishlist` appears in their store.
- **Cosmetics**: frames, display cases and profile decoration, as ADR-035 described.

### 4. Seasons and albums

- **One album per season.** Each season has its own album and its own limited card with its own supply. A new player always has a season they can start fresh, and finished albums keep their history.
- **A card placed in the album is locked permanently.** It cannot be listed, printed, dismantled, exported or removed. Without the lock, one set of cards could be passed from user to user and claim every limited card in the season. Duplicates stay free: keep, dismantle or trade them.

### 5. Limited cards

Limited cards are a **separate card type** from album cards. Each season sets a fixed supply (10,000 in the example) and splits it:

- **80% for completing the album**, first come first served, **one per account**. Demo accounts cannot claim.
- **20% in stores, at the ordinary price for their rarity.** This is the luck factor, and it is the safe kind: the luck is in what the store offers, which is free; the purchase is made with the card in view.
  - **Limited cards appear only in the 3 base slots, never in Expansion slots.** Otherwise money buys cheap packs, the packs become Crystal, the Crystal buys Expansion, and Expansion buys a better chance at a limited card. That chain is paying for a chance at a valuable random outcome, one step removed, and it is the line this ADR exists to hold.
  - The store share is **paced by a daily quota** across the season, so it is not gone in the first week.
- **Tradable and printable, not dismantlable.** The supply can only fall on purpose.
- **The supply cap is enforced on chain** (a `maxSupply` per limited template), not only in the database, so "only 10,000" can be checked by anyone, the same way pack fairness can today.

### 6. When the limited cards run out

A user who finishes the album after the 80% is gone still receives something, and it must not compete with the limited card:

1. **A numbered Completion card for every completer**, including those who got a limited card. Soulbound: it cannot be sold, printed or dismantled. It carries the season, a sequence number and the date ("Season 1 Completer #12,481"). It is proof of the achievement, not an asset.
2. **Removed 15 October 2026: no reserved share of the next season.** This item first held 10% of the next season's limited supply for completers who missed out, promising that nobody loses twice in a row. Under the sizing rule it could not keep that promise; see part 3 of the amendment below.
3. **A Crystal item reward**, such as a Wish Card or 30 days of Expansion.

All of this is **announced before the season opens**, and the remaining limited supply is shown live ("3,204 / 8,000 left"). A user deciding to finish an album late must know what they are racing for. A reward announced only after the sellout is a trust problem and possibly a consumer-protection one.

### Lines this ADR does not cross

1. **Money never buys anything random.** No paid refresh and no paid pack of unseen cards. Every purchase made with Credits is of cards already in view.
2. **Crystal is never cashable.** In practice Crystal can now be obtained with money through cheap packs, and that is fine only while it cannot be turned back into money.
3. **Nothing bought with Crystal raises the chance of a limited card.** Expansion slots never hold one and Wish Cards cannot pick one.

### Consequences

- **ADR-021 is superseded.** Fixed 5- and 10-card packs with a guaranteed Rare+ slot do not exist in this model. With contents visible, a guarantee has no job to do.
- **ADR-029 changes shape but stays.** One entropy request per rotation (every 6 hours), not one per pack; each user's store is derived from that seed and their user id, and its commitment is stored before anything is revealed. That is a large saving in entropy fees. The off-chain shuffle limitation recorded there still applies, and the fairness claim moves from "this pack was not tampered with" to "this store was not tampered with".
- **ADR-009 grows.** The odds table now drives what the store offers, and also the daily pacing of limited cards.
- **ADR-026 needs its reason restated.** "Crystal cannot be purchased" is no longer the protection, since a cheap pack bought to dismantle is a purchase of Crystal in all but name. The protection is that Crystal **cannot be cashed out** and buys nothing random.
- **ADR-035 is superseded.** It allowed cosmetics only and rejected selling cards for Crystal. This ADR sells convenience and the Wish Card. The Wish Card is acceptable because its price keeps dismantling a net card sink and it cannot reach a limited card. ADR-035's warnings still apply: store prices set a floor for what Crystal is worth, and an attractive store makes people dismantle more, so watch the dismantle rate after launch.
- **ADR-024's missing sink is answered.** Crystal finally has places to go.
- **Revenue depends on Crystal items being wanted.** Users now buy only what they choose, so ordinary packs sell only while Crystal is worth having. If the items are weak, the cheap packs stop selling and pack revenue falls to the good packs alone.
- **The next contract must carry**:
  - a `maxSupply` per limited template;
  - an album-lock status that blocks transfer on chain, like `Vaulted`;
  - a soulbound Completion card.

  This adds to what ADR-033 (a `setURI`) and ADR-036 (a holder-signed `marketplaceTransfer`, `AccessControl`) already ask of the next contract. Which of those ship together is not decided here.
- **Two clocks, one store.** A 6-hour rotation and a limited supply both create urgency. Reasonable for adults, and also the kind of design consumer regulators such as the EU's Digital Services Act look at. Reserve exists partly to soften it.
- **Kompu gacha needs a legal read** wherever Japan is a target. The design should pass, because every card is bought in view and the Wish Card and the marketplace give non-random routes to every album card. That is an argument, not a ruling.
- **"One per account" is not one per person.** Google accounts are cheap to make. Sybil resistance beyond excluding demo accounts is not solved here.

### Not decided here

- Prices, the album's size and season length. Each season's limited supply is set per Series; the rule for sizing it was decided on 15 October 2026 (amendment below).
- How long Expansion lasts, and Crystal prices for every item.
- The time zone the 6-hour rotation is anchored to.
- What a finished season's album looks like afterwards. The locked cards stay locked; whether the album remains on display is open.
- A legal review for each market before launch.

**Amendment, 15 October 2026: how large the limited supply is, and a catch-up for late completers.**

Decided after running the Economy Lab, an interactive simulation kept outside the repo, on its proposed numbers:
- odds 70/20/8/2;
- card prices 40/120/360/1,200 Credits;
- dismantle yields 20/50/120/300 (ADR-026);
- Wish Cards 150/250/450/1,200 Crystal;
- a 40-card album (20/12/6/2) and a 90-day season.

It simulates three player profiles:
- **Casual**: $8 a week, one store visit a day.
- **Regular**: $20 a week, two visits a day.
- **Collector**: $50 a week, four visits a day, with Expansion.

Like every number in this ADR, these are placeholders. The rules below are the decision.

**1. The album share of a season's limited supply is 50–70% of the players projected to complete that album within the season.**

- **Above 70% it may not sell out.** 8,000 album limited cards cannot sell out to 6,000 album chasers. The live counter in section 6 would count down towards a zero nobody reaches, and the section 6 rewards would never trigger. "Limited" would be a word, not a fact.
- **Below 50% most completers miss out**, and the album stops being worth the chase.
- **In between**, the early completers get one, the counter reaches zero inside the season, and the late completers get the section 6 rewards.
- **The projection is made per Series before launch**, with the Economy Lab; the creator proposes a number and Gachard sets the final one (ADR-039 §4). The number is fixed at launch, because `maxSupply` is on chain. The store keeps 20% of the total, so the total supply is the album share divided by 0.8.

**2. Catch-up: in the last 14 days of a season, Wish Cards cost 50% less Crystal.**

The simulation first reported that Casual players complete 0% of albums. That was a flaw in the model, not in the design: it discarded unspent weekly budget, but Credits never expire. With saving allowed, the options compare like this:

| Option | Casual completes | Effect on the other profiles |
|---|---|---|
| Accept as is (40 cards, 90 days) | about 65%, median day 85 | none |
| Smaller album (30 cards) | 97% | spending falls 14–19% for every profile (Regular median $96 → $79); Collectors finish in 9 days |
| Longer season (120 days) | 100% | 3 seasons a year instead of 4; Regulars finish on day 33 and then wait three months |
| **Accept, plus the catch-up (chosen)** | **83%** | none |

Casual players did not fail for lack of time, or because the album was too big. In 207 of the 209 failed runs, the only cards missing were Legendaries, usually just the last one.
- The cheapest pack holding a Legendary costs about 1,620 Credits, two weeks of a Casual budget.
- Their Crystal stops growing once only Legendaries are missing, because they stop buying packs.

The catch-up targets that and nothing else. Season length, the album and revenue are unchanged.

Without the catch-up, the harshest case in this ADR is the common one. A player ends the season one card short, and the 39 cards already placed stay locked permanently (section 4) for no reward. The catch-up also strengthens the kompu gacha argument above: every album card already has a non-random route, and that route gets cheaper exactly when time runs out.

- **Scope**: only empty slots in the album of the Series whose season is ending, during its last 14 days. Other Series' albums are unaffected.
- **A card picked with a Wish Card goes straight into its album slot and is locked there.** This applies always, not only during the catch-up. Without it, a Legendary picked for 600 Crystal could be listed on Trade, and the discount would become a Crystal farm whenever a Legendary sells there for more than that.
- **Still a net card sink**: 600 Crystal is twice what a Legendary dismantles for.
- **For those 14 days a Wish Card is cheaper than the store path** for the same card: about 1,020 Credits' worth of Crystal at the cheapest Crystal price, against about 1,350 through a pack. This is deliberate, and the two rules above contain it. The Economy Lab's "the store stays the main path" check is measured at full price.
- **Announced before the season opens**, like the section 6 rewards. Waiting for it has a cost, because by then the album's limited cards are usually gone.
- **A creator who wants a gentler Series can still choose a longer season** from the fixed options in ADR-039 §4 (60, 90 or 120 days in the creator portal design). At 120 days the simulation puts Casual completion at 100%.

**3. No reservation: the album's limited cards are first come, first served.** Decided 15 October 2026.

Section 6 promised "Nobody loses twice in a row" through a 10% reserved share of the next season. Under the 50–70% rule it could not keep that promise. 30–50% of completers miss out every season by design, and 10% of the next season's supply covers only about 12–29% of them.

For example:
- A season has 2,000 completers, an album share of 1,200 and a total supply of 1,500.
- 800 completers miss out.
- The next season, at the same size, reserves 10% of 1,500, which is 150 cards.

Two fixes were considered:
- **Size the reservation to the number who missed out**, on top of the next season's supply. It keeps the promise, but it has two costs:
  - The supply grows every season by 43–100% of the album share (two thirds of it at 60%). That dilutes every limited card already held, including its price on Trade.
  - The next contract would need eligibility carried across seasons.
- **No reservation (chosen).** Scarcity stays exact, there is no promise to break, and the contract needs no cross-season logic.

The cost is accepted knowingly. In practice "first" means the players who play and spend the most. Under the sizing rule the stock runs out once 50–70% of the season's completers are done, which is well before Casual players finish (median day 85 in the simulation). So Casual players rarely get an album limited card. They keep three routes:
- the numbered Completion card and the Crystal item reward, which every completer gets;
- the 20% of limited cards in stores. With the Economy Lab defaults, a player sees at least one in about one season in nine;
- Trade.

The sold-out screen points to the last two, where the reservation used to be.

**Amendment, 15 October 2026: the store's seed must not be predictable.** Found on 14 October 2026 while designing the store: if each user's store is derived from a public seed and their id, anyone can compute every pack before revealing a single card. That makes Detection free and the reveal pointless. The fix is a server secret committed before each rotation and revealed after it, plus an API that sends one card at a time, only when it is revealed. It is specified in ADR-040 and `docs/CONTRACT-V2-SPEC.md` §7.

**Amendment, 15 October 2026: a bought pack is replaced at once.** Decided the same day, at the founder's request. When a user buys a pack, its slot immediately shows the next pack, without waiting for the rotation.

The rules:
- **Each slot has a queue fixed when the rotation starts.**
  - It is derived from the same seed, server secret and holder as the opening shelf (`derivePack(slot, depth)` in `frontend/lib/v2/chain-v2.ts`), so the commit-reveal of ADR-040 covers it.
  - Buying draws nothing. It only uncovers a pack that was already decided.
  - This is why a refill is not the paid refresh this ADR forbids: a refresh is a new random draw that the payment causes, and here the payment causes none.
- **Two replacements per slot per rotation, at most.** A slot shows three packs in a rotation, then "Sold out until next rotation". The rotation keeps its meaning: there is still something to come back for.
- **The whole-shelf discount applies to the first full shelf of a rotation only**: the opening 3 packs, or 5 with Expansion, bought in one transaction. Without this, a user could buy a full shelf, wait for it to refill, and buy it again at 15% off.
- **Replacement packs follow every other store rule.** Reveal stays free and card by card; prices appear only once a pack is fully revealed; Detection marks a replacement pack like any other.
- **Expansion slots still never hold a limited card**, replacements included.
- **Reserve does not trigger a replacement.** Only a purchase does.

**Limited cards in replacement packs: allowed, with ordinary odds, as a per-season setting** (`limitedInRefills`, on by default). This was debated and is recorded with both sides, because it is the closest this design comes to its own line.

- **For**: every pack is revealed before it is bought, nothing forces a purchase, and a limited card in a replacement pack still has to be bought at full price with the card in view.
- **Against, and the reason it is a setting and not code**:
  - **Access is gated by payment.** The opening shelf can be seen for free, but a replacement pack only appears after the previous pack is paid for. Regulators of loot boxes and sweepstakes ask whether access to a valuable chance depends on paying, not whether anyone is forced. A limited card is worth more than its ordinary price, so the chance to buy one has value.
  - **Fairness.** The store share is paced per day. A user who buys every replacement sees up to three times as many cards per rotation, and so takes a larger part of that share. Album rewards are already first come, first served, which also favours heavy players. Casual players are left with Trade.
- **Conditions attached to the decision**:
  - **It is a mandatory question for the legal review** (`docs/PLAN-STORE-V2.md`, P10) before mainnet.
  - **The Economy Lab measures who receives the store share**, by player profile.
  - **The setting can be switched off for a season** without a code change, if either the legal review or the data says so.
- **Contracts unchanged.** The store's contents are derived off chain and proven by the existing commit-reveal. `GachardStore` and the ledger need nothing new.

## ADR-039: Other Creators Release Their Own Series, Each on Its Own Shelf

**Status**: Proposed, 15 October 2026. **Nothing in this ADR exists in code.** It extends ADR-027, which today is only an application form, and applies ADR-038 per Series.

**Context**: every design so far assumed one catalogue owned by Gachard. The code agrees:
- ADR-027 stores an application with `status: "pending"` and nothing else: no creator account, no upload, no review flow.
- Card templates have no owner field.
- The deployed contract records only a token's rarity, so it cannot prove which creator a card came from.

**Decision**: a creator's TCG release is a **Series**: its own shelf, album, season, Limited supply, card back, pack art, banner and accent colour. Every rule in ADR-038 applies inside each Series.

### 1. The store
- **One shelf per Series.** All shelves rotate together on the same 6-hour clock. There is one rotation count for the whole store, not one per creator.
- **Shelves of followed Series come first.**
- **The shelf discount is per shelf**: the whole shelf of one Series, bought in one transaction.
- **Limited cards appear only in each shelf's 3 base slots.**

### 2. Crystal items apply to every shelf
- **Expansion** adds two slots to every shelf.
- **Detection** marks packs on every shelf.
- **Reserve** holds one pack from any shelf.

An item is bought once and works across the whole store, not per creator.

### 3. One currency
Credits and Crystal are global. Dismantling a card from any Series yields Crystal that can be spent anywhere.

The consequence has to be accepted, not discovered later. A Wish Card for Series B paid with Crystal from Series A's duplicates earns Series B nothing. A creator's revenue share is therefore counted only on Credits spent on that Series' packs.

### 4. Gachard sets the economy; creators choose within bounds
- **Prices**: Gachard's rarity price table. A creator picks a tier inside a band set by Gachard.
- **Odds**: per-rarity odds inside a band set by Gachard, published on the Series page.
- **Album**: size and rarity composition within ranges. Season length is picked from fixed options.
- **Limited supply**: the creator proposes a number; Gachard sets the final one from projected completers. The Economy Lab run on 14 October 2026 found that a supply above the number of completers never sells out and so is not scarce. The rule, decided in the ADR-038 amendment of 15 October 2026, is 50–70% of projected completers.
- **Dismantle yields are fixed by Gachard and are not a creator choice.** Because Crystal is global, a Series with low prices or high yields would become the cheapest Crystal source for the entire platform. Its duplicates would then fund Wish Cards in every other Series, which earn nothing from them. **No Series may produce Crystal more cheaply than the platform floor** (a maximum Crystal per Credit). The tier band exists partly to enforce this.
- **The Set Builder runs the same checks as Lab Ekonomi, live.** A Series cannot be submitted while any check fails.

### 5. Brand and controls
The creator's brand lives in the **content**: artwork, pack art, card back, banner, and an accent colour on the Series page. The **controls stay Gachard's**: buttons, prices, rarity glyphs and dialogs. Rarity reads the same in every Series, and no creator can style a buy button into something misleading.

### 6. Two ways in, both filtered
- **Invitation**: Gachard invites a brand. This skips application screening, but not Series review.
- **Open registration**: application, then screening, then a creator account. The ADR-027 form becomes the first step of this path.

Every Series goes through review, whichever way the creator came in.

### 7. Lifecycle of a Series
**Draft → Submitted → In review → (Changes requested) → Approved → Scheduled → Live → Season ended.**

- **Before approval a Series is invisible to users.**
- **Once approved and scheduled**, it gets a "Coming soon" page with a launch date and a Follow button. Nothing can be revealed or bought before it is Live.
- **Once Live**, rarity, odds, album composition and Limited supply are locked. Only text errata are allowed. An art change is versioned, never silent.

### 8. Review checklist
- evidence of IP ownership or licence;
- content policy;
- print readiness (resolution and bleed);
- economy configuration passing every check;
- a signed agreement. The 70/30 split is still a plan, not code, and payments are still simulated (ADR-008).

### 9. On-chain
**The next contract must record a `seriesId` and `templateId` for every token**, so that which creator a card came from can be proven on chain. This joins the next-contract requirements already listed in ADR-033, ADR-036 and ADR-038.

### Consequences
- **Reveal load grows with the number of Series.** Each shelf is 15 cards per rotation, so ten followed Series is 150 cards to reveal one by one. Detection becomes close to essential. Shelves that are not followed may need to stay collapsed by default.
- **Global items gain value as the catalogue grows.** Expansion on ten shelves is twenty extra packs per rotation. Crystal item prices set for one shelf have to be revisited as Series are added.
- **Lab Ekonomi models one shelf** and needs a multi-shelf mode before these prices are final.
- **Revenue accounting is per Series and counts Credits only.**
- **Open registration raises the risk of infringing IP** reaching review, and of a counterfeit Series reaching users if review misses it. A takedown procedure is needed before open registration launches.

### Not decided here
- The width of the price tier band, the odds band, and the album ranges.
- The takedown procedure, and payouts, which wait on a real payment rail.
- Whether shelves that are not followed are shown, collapsed, or hidden.

**Amendment, 15 October 2026: card images have one specification.** A card file is **63 × 88 mm with 3 mm bleed** (1630 × 2220 px at 600 dpi, at least 815 × 1110 px). The same file serves the app and the printed card.
- Text and faces stay inside a 3 mm safe area.
- A 12 mm zone in the bottom-right corner is reserved for the per-card QR and serial in print, and for the album lock icon in the app.
- In the app, card art is always shown uncropped at 63 : 88. Every platform label (rarity frame, Series chip, wishlist, price) sits outside the card face.

The full spec, banner and pack-art sizes, the automatic checks, and three mismatches found in the current assets are in `docs/CREATOR-ASSET-GUIDE.md`. The "2480 × 3508 px" figure in the first portal design was A4, not a card, and has been corrected.

**Amendment, 15 October 2026: a creator's game may read cards, never write them.** A creator who runs a game can show players their cards from that creator's Series: as characters, outfits or bonuses, or unlocked by scanning a physical card.
- **Through a Gachard API, not the chain.** Most cards sit in custodial wallets, so only Gachard knows whose they are. The player never meets a blockchain term (ADR-002).
- **The player connects their Gachard account and consents.** Access covers only that creator's Series. The game sees a public name or collector label, never a username (ADR-032).
- **A sold card simply disappears from the game**, so nothing in the game can be used to hold a card back.

Games never mint, move, lock or burn a card, and no game is given a role on any contract. Rewarding play with new cards was considered and not taken: it would need a game-specific minting module, and it brings back the question ADR-038 exists to answer, whether a player pays for a random card. So the next contract needs nothing for this beyond `seriesId` and `templateId` on each card (ADR-040). The API is not built.

## ADR-040: The Next Contract: Holder Signatures, Split Roles, Limits, and Theft Handled by the Platform

**Status**: Proposed, 15 October 2026. **Not deployed and not audited.** A first Solidity draft is in `contracts/src/v2/`, with deploy, handover and check scripts in `contracts/script/v2/`. Its 88 tests, invariant tests included, pass alongside the 78 v1 tests, and a Slither run has been triaged (spec §16). The backend half is `frontend/lib/v2/chain-v2.ts`, tested against the contracts with shared vectors. The full specification is `docs/CONTRACT-V2-SPEC.md`; this ADR records the decisions and the reasons. It turns ADR-036's "next contract" list into a design, and carries what ADR-033, ADR-038 and ADR-039 ask of the contract.

**Context**: the migration to a new admin wallet and new contracts was paused on 13 October 2026 until the sales model was settled. ADR-038 and ADR-039 now say what the contract has to carry. The contract is the one part of the infrastructure that cannot be patched after it is deployed, so security, ease of use and room to grow are settled here, before any Solidity is written.

**Decision**:

1. **Three contracts.** An immutable card ledger with no proxy, and two replaceable modules: Store and Albums.
   - The platform grows through new modules and adjustable parameters, never a new ledger.
   - No proxy on the ledger: an upgrade right is the power to rewrite who owns what, and ADR-036 exists to shrink powers like that.
2. **Moving or burning a card needs the holder's EIP-712 signature.**
   - For custodial users, the backend signs as holder with the custodial key, so the user still signs nothing.
   - For self-custody users, the user signs in Privy.
   - A leaked Relayer key alone can no longer take or destroy anyone's card.
3. **Roles are split by risk, and anything that reduces risk is fast:**
   - **Admin**: a 48-hour timelock, proposed by a 2-of-3 Safe.
   - **Guardian**: a cold key that can pause, lower limits, revoke hot roles and cancel a queued admin action, all instantly. Cancelling was added the same day, while writing `docs/INCIDENT-RUNBOOK-V2.md`: with two Safe keys stolen, whatever they queue can still be stopped.
   - **Relayer**: hot keys that submit the everyday transactions.
   - **Modules**: they mint.
   - Granting a role is slow; revoking one is instant.
4. **Limits are parameters, not constants.**
   - Per hour, with a bucket per Relayer key.
   - Raised through the timelock, lowered instantly.
   - Alerts at 60–70% of a limit.
   - A purchase that hits a limit waits as "Processing"; it never fails.
   - Limited `maxSupply` never rises.
5. **Pause covers the privileged paths only.** A holder's own transfer of a Digital card is never paused.
6. **Stolen cards and taken-over accounts are held by the platform, not frozen by the contract.**
   - A freeze power would be a new weapon for whoever steals a key, and would break ADR-031's self-custody promise.
   - It would catch innocent buyers.
   - It would add little: a card has no name or image outside Gachard (ADR-033), so the only place to profit from one is inside Gachard.
   - The hold covers that completely. Every action starts from the card's database document (ADR-036), and a held card is refused at import.
7. **Store fairness per rotation**: a server secret is committed before the rotation and revealed after it, and the API sends one card at a time. This closes the predictability gap recorded in the ADR-038 amendment of the same day.
8. **Redeem**:
   - The contract checks the code itself against `keccak256(tokenId, printCycle, code)`, not a public hash anyone can copy.
   - The off-chain hash moves from `sha3-256` to `keccak256`.
   - The code stays at 80 bits or more.
9. **Signatures are checked as ECDSA first, then ERC-1271.**
10. **Retries are safe by construction**: a `purchaseId` and signature nonces make a second submission revert instead of running twice.

**Found while writing it**, all cases of a document or design disagreeing with the code:
- ADR-004 says `requestPrint()` moves the token to the contract; it never has. Amended above.
- `frontend/lib/redeem-code.ts` comments that it hashes with keccak256 "to match Solidity"; it uses Node's `sha3-256`, a different function. Harmless in v1, which only compares hashes; fatal in v2, which verifies on chain.
- The redeem screen in `design/gachard.pen` shows 8 boxes, which is 40 bits and brute-forceable in minutes against a public commitment. The code issues 16 characters.
- OpenZeppelin 5.6.1's `SignatureChecker` skips ECDSA for any address with code. Privy's sponsored wallets carry EIP-7702 code (ADR-031), so using it as is would reject every self-custody user.
- v1 lets anyone rewrite `lastOwner` for any Digital card with a zero-value transfer, because its `_update` override writes `lastOwner` on every transfer. Nothing in the app reads it (`getLastOwner` has no caller; Scan reads MongoDB), so the harm is limited to what the chain reports. v2 rejects any amount other than 1.
- Physical cards printed under v1 keep their codes when they move to v2. v1 committed each code with NIST SHA3-256, which Solidity cannot compute, but the code itself is kept AES-encrypted in `redeem_codes` for printing. `MigrationMinter.migratePrinted` mints the twin, and the backend locks it again under the same decrypted code. v1 is retired at the cutover so a code cannot redeem twice (spec §17). *Corrected the same day: this line first said the codes were never stored.*

**Decided the same day**, as recommended in the specification's §18:
- signers of the Safe (decided the same day: 2-of-3, all held by the founder: two hardware wallets and an offline backup);
- pause scope;
- a KMS attestor co-signing purchases, Wish Cards and rewards;
- the redeem code format (16 characters of Crockford base32);
- moving signing and custodial keys out of the database environment;
- a 0% ERC-2981 slot;
- the timelock delay;
- checking album completion on chain.

**Consequences**:
- **More moving parts**: a Safe, a timelock, a guardian key and a signer service. Key handling needs a written ceremony, and the incident runbook needs rewriting for roles.
- **Administrative changes take two days.** A Series launch must be scheduled at least 48 hours ahead; ADR-039's review flow already schedules days ahead.
- **Nothing changes for users.** Custodial users sign nothing; self-custody users sign as they already do for export.
- **An external audit is required before mainnet**, and it costs money.
- **Until the migration, v1 stays exactly as ADR-036 describes it.**

## ADR-041: Gachard on NEAR for the NEAR Hackathon, in a Separate Repository

**Status**: Proposed, 21 October 2026, **amended by ADR-042 (5 November 2026)**,
which settles its open questions against the published rules. Read the two
together. Nothing is built. This ADR records a
direction and the lines that go with it, before any Rust is written.

**Context**: NEAR HACKATHON runs 1-14 November 2026. Two of its thirteen
tracks fit this product without bending it: `games` ("judged on the game loop,
not the token", with a bonus if players never notice the chain, which is
ADR-002) and `nfts` ("NFTs that hold money, carry credentials or grant
access"). The jury includes AI judges that read the repository.

The v2 migration is paused and unbuilt. ADR-038 settled the sales model,
ADR-039 the Series, ADR-040 the contract, and all of it is designed for EVM.
Nothing is deployed, so nothing is being abandoned by spending two weeks
elsewhere.

Checking the provenance surface before deciding anything found that the
product's headline claim is not backed by the code. That is in **Found while
writing it** below, and it is the reason this ADR puts provenance first rather
than treating it as a feature already shipped.

**Decision**:

1. **A new repository, `gachard-near`, with no NEAR code committed before 1
   November 2026.** Not a folder in this repository, not a fork.
   - What is submitted is a repository link. This repository's history is 199
     commits of Monad work, and no folder inside it changes what a judge
     clones.
   - A separate repository also removes the way this goes wrong: committing
     hackathon work here out of habit before the window opens.
   - Local folder `D:\gachard-near`, a sibling of this one.

2. **Monad is not deleted.** v1 stays live and deployed, the v2 Solidity stays
   in `contracts/src/v2/`, and this repository keeps the decision record,
   including this ADR. The NEAR repository carries no `ethers`, no Pyth, no
   Privy, no Solidity.

3. **Prior work is disclosed in the README, not hidden.** The concept, the
   economy (ADR-038, ADR-039), the Crystal Night design system and the artwork
   were made before the hackathon for the Monad version, which is linked.
   Everything in the new repository's history is written 1-14 November. The
   precedent rules of previous NEAR hackathons ask for exactly this
   disclosure; a repository that *is* the Monad product is the thing to avoid,
   not the mention of it.

4. **What NEAR replaces**:
   - Cards become NEP-245 in Rust, not ERC-1155.
   - Rotation seeds come from the contract's own randomness after the commit,
     not from Pyth Entropy. No oracle, no callback to wait for. The guarantee
     has to be read in the NEAR docs before it is claimed.
   - The relayer uses several access keys on one account. NEAR counts a nonce
     per key, so the collisions of known issue 6 stop being a class of bug.
   - Each user gets a named sub-account. Gas stays on the platform through
     meta transactions (NEP-366), so ADR-003 holds unchanged.
   - Moving a card is authorised by the caller being the holder, not by an
     EIP-712 signature. Verified in NEAR's docs on 21 October 2026, because
     this is one of the two reasons for the whole move and it was close to
     being overstated: a FunctionCall access key is restricted to one
     receiver contract, optionally to named methods, and it cannot attach a
     deposit at all. NEP-245 requires exactly 1 yoctoN on every transfer
     method, and NEAR documents that pattern as deliberate - the deposit
     forces a full-access key, so a restricted key cannot transfer.
   - **What that does and does not buy, stated precisely.** For a
     self-custody user it is a protocol guarantee: Gachard holds at most a
     FunctionCall key on their account and therefore cannot move their
     cards, full stop. That is strictly stronger than v1, where
     `marketplaceTransfer()` is `onlyOwner` and can take a card out of a
     user's own Privy wallet - the limit the Privy bounty answer has to end
     by admitting (ADR-036). For a custodial user it buys nothing by itself:
     Gachard holds that account's full-access key, as it holds encrypted
     private keys today (ADR-020), and whoever holds that key can move those
     cards on any chain.
   - **The structural gain is the absence of a backdoor, not the absence of
     risk.** On NEAR ownership is per account by construction, so no single
     key moves every card; the exposure is the custodial key store, which is
     the same exposure on both chains. ADR-040 spends a 2-of-3 Safe, a
     48-hour timelock, a Guardian and an EIP-712 scheme to reach roughly
     where NEAR starts. Do not write or say that NEAR solves ADR-036. It
     removes the contract-level backdoor and leaves the key store.
   - Privy is out of scope.

5. **Token metadata is set on NEAR. ADR-033 does not carry over, and is not
   amended for v1.**
   - Its commercial reason - nothing renders elsewhere, so trading comes back
     to Gachard, which is "what makes a marketplace fee collectable at all" -
     protects a fee that was removed on 25 September 2026 (ADR-024, amended).
     It currently defends nothing that exists, and ADR-033 itself calls that
     reason the weak one and says not to pitch it as the moat.
   - Its second reason is chain-specific: no external surface indexes Monad
     Testnet. That is not true of NEAR, where NearBlocks indexes NEP-245
     events as a matter of course.
   - Its third reason, the categorical anti-impersonation rule, is the one
     worth keeping, and it is kept the way ADR-033 itself recommends: a
     verification surface that makes the rule checkable, plus the physical
     card.
   - The deciding reason is simpler than any of them. Provenance that can only
     be read inside the issuer's own website is not provenance.

6. **Provenance is the claim, so it has to be checkable without Gachard.**
   - Scan reads the chain, with the database as a cache for speed only.
   - Every history row carries a link to NearBlocks. A judge clicks and
     checks.
   - No badge that is not backed by a read. "Verified authentic" is replaced
     by something a stranger can try.
   - This is also the honest answer to the form's question of how NEAR fits.
     On Monad, making provenance readable meant translating hex addresses to
     names through a database table, and that table is exactly the part an
     outsider cannot verify. On NEAR the readable name *is* the on-chain
     account, so one list is both legible to a collector and checkable by a
     stranger. That is a property of NEAR's account model, not a thing built
     on top of it.

7. **Scope for fourteen days**: Google sign-in, the store that shows a pack
   before it is bought, buying with simulated credits, collection, dismantle
   to Crystal, trade, and the scan surface of point 6. Out: Privy, Creator
   Series, the admin console, AI risk scoring, v1 migration.

8. **The v1 scan is corrected separately**, in this repository, independent of
   the hackathon: return `txHash`, and stop printing a verification result
   that is not one. It is small work and it closes a false claim that is live
   today.

**Found while writing it**, all cases of a document or the UI asserting what
the code does not do:
- `/api/scan` is the provenance surface and reads MongoDB only. Its own
  comment says so, and the object it returns as `onChain` is built from cached
  database fields.
- `verification.verified` compares a value with itself. `statusCode` is
  derived from `card.status`, then `STATUS_LABELS[statusCode]` is compared
  back against `card.status`. It is true for every card in a normal state and
  false only for an unexpected one such as `Released`. No chain read happens
  anywhere in the route.
- The page states "Verified authentic" and "Signature validated against
  verified record", and the landing copy says every card "carries a unique
  verified signature". No signature is validated.
- The scan returns no transaction hash, so nothing in the history can be
  checked. The hash exists: `transactions` stores it and `/api/privy/history`
  returns it. `lib/transactions.ts` states the opposite rule in a comment -
  "txHash is NOT exposed" - which is true of Scan and not of Wallet.
- Taken together, a judge opening `/scan` sees a list and a green badge that
  must be taken on trust. That is the one thing a chain was supposed to
  remove, and it is the claim this product leads with.

**Not decided here**:
- **Whether NEAR is a hackathon exercise or the real v2 chain.** If it stays
  an exercise, the Rust is discarded on 15 November and the two weeks are
  spent for the prize and the lessons. If it is adopted, ADR-040's EVM design
  - Safe, timelock, EIP-712, Guardian - has to be re-expressed in NEAR's roles
  and keys, and that is a separate ADR.
- **Whether print, vault and redeem are in scope.** They are the part of the
  loop nobody else has: one token id surviving a physical print and a return
  to digital, rather than burn-and-remint. If provenance is the headline, they
  belong in scope and `nfts` rises to equal `games`. If they stay out, the
  provenance claim narrows to a transaction list, which is not distinctive.
  This is the scope decision to settle before 1 November.
- **Whether existing code may be reused.** The hackathon's published rules say
  nothing about pre-existing projects; the site says only "build your project
  during the hackathon". Previous NEAR hackathons accepted "new and
  substantially modified existing projects". Asked in the NEAR Discord, not
  yet answered. If reuse is allowed, the first commit is the reused TypeScript
  under a tag, so the hackathon's work is legible as a diff. If not,
  everything is written fresh. The separate repository is right either way.
- **Whether Monad Metropolis permits the same project to enter elsewhere.**
  Not checked.

**Consequences**:
- **Two weeks are not spent on ADR-040's migration.** Nothing is deployed, so
  nothing regresses; the migration resumes where it paused.
- **The store service survives the move.** Rotation, refills, pricing and the
  view depend on a four-method `StoreChain` port and a repository interface,
  not on a chain. A NEAR adapter is a new implementation of that port, and on
  NEAR `requestEntropy` and `readSeed` collapse into one call.
- **ADR-033 now holds on one chain and not the other.** It stays in force for
  v1 and should carry a pointer to this ADR, or a later reader will find two
  live decisions that disagree.
- **The provenance correction of point 8 lands in v1 regardless.** It is the
  one piece of this ADR that is worth doing even if the hackathon is skipped.
- **An AI judge reads the repository.** That cuts both ways: the README has to
  be written for a machine reader, and an unbacked claim left in the code is
  found rather than overlooked.

## ADR-042: NEAR Hackathon Scope, Settled Against the Published Rules

**Status**: Accepted, 5 November 2026, **scope and track replaced by ADR-043
the same day** (decisions 1, 3, 4 and 7). **Nothing in this ADR is built.** It
settles what ADR-041 left open and amends it where the rules have since
answered. ADR-041's reasoning about NEAR itself still stands.

**Context**: ADR-041 was written on 21 October, when the site said little about
existing projects. `https://nearhackathon.com/HACKATHON.md` now answers those
questions. It tells readers to re-read it before submitting, because dates and
rules may change, so the rule numbers below are as read on 5 November.

Development ends 14 November 2026, 23:59 UTC, nine days from this decision.
This folder is still a copy of the Monad codebase: no `.git`, no Rust, no NEAR
integration, no `cargo` or NEAR CLI on this machine. The rules decide what that
copy is worth:

- **Q-002**: an existing product on another chain is allowed, but only the NEAR
  integration built in the window is judged, and it must be disclosed.
- **Q-004**: an old project as it stands does not qualify.
- **Q-001**: the window opened with the announcement on 19 October. Earlier
  commits are baseline.
- **Q-003**: a new repository is not required; a dedicated branch, or tags
  `pre-hackathon` and `hackathon-submission` with a README link to the diff, is
  enough.
- **Q-005**: reused code and AI-written code are allowed if listed in the README.
- **Q-010, Q-011**: testnet-only is eligible, no integration is mandatory, and
  an own contract on NEAR that fits the track is enough.
- **Q-012**: a local-only demo is allowed with a public repository, a
  reproducible README and a video. Screenshots alone are not enough if judges
  cannot open the demo.
- **Q-017**: Claude Code and Codex screen for reproducibility and feature
  verification, and give a preliminary score. Humans decide, and a low AI score
  alone cannot reject.

So everything the Monad version already does earns nothing by itself. The work
that counts is the NEAR contract and what is connected to it.

**Decision**:

1. **Track: `games` first. `nfts` only if print and redeem are finished and
   checkable on chain.** `games` fits as the product stands: NEP-245, social
   login, a player-owned market, and a bonus if players never notice the chain.
   `nfts` asks for assets that act as accounts, holding money or access rights,
   and a Gachard card does not. ADR-041 said both fit without bending; for
   `nfts` that overstated it. What could justify it is a card that carries a
   redeemable claim on a physical object through one token id.

2. **Reused code is allowed, and the separate repository stays.** ADR-041's
   reason for it, a clean thing for a judge to clone, is still good; the rules
   no longer require it.
   - The first commit is the reused baseline, tagged `pre-hackathon`. That
     commit is dated inside the window, so the README says plainly that it is an
     import and links the Monad repository it came from.
   - The tag `hackathon-submission` marks what is submitted, and the README
     links the diff between the two. The diff is the honest answer to "what did
     you build here".
   - ADR-041's rule that no NEAR code be committed before 1 November is moot,
     since the window opened on 19 October.
   - ADR-041's "no `ethers`, no Pyth, no Privy, no Solidity" holds at the
     `hackathon-submission` tag. The baseline may contain them; removing them is
     part of the diff.

3. **In scope, in build order:**
   1. A Rust NEP-245 contract on testnet: mint, transfer, burn, print lock and
      redeem, with one token id per card (ADR-001) and metadata set (ADR-041).
   2. Google sign-in, plus a demo login for judges, with a sub-account per user
      and gas paid by the platform (ADR-003).
   3. The store loop from ADR-038: reveal card by card, buy with simulated
      Credits (ADR-008), dismantle to Crystal, trade between players.
   4. Scan reading the chain, with the database as a cache only (ADR-041).
   5. A reproducible README and a one-command local mode.
   6. A fast-forward simulation of the economy.

   If time runs short, cut from the bottom of that list, except item 5, which
   is never cut: a project the screen cannot run has shown nothing. Fast-forward
   goes first, then hosting. Google sign-in may fall back to demo login only, and
   the README must then say so. Crystal items, albums, Limited cards and the
   shelf discount are out from the start, so they are not on this list to cut.

4. **Print, vault and redeem are in scope, at contract level plus one simple
   screen.** This is the question ADR-041 said to settle before 1 November. One
   token id surviving a trip to a physical card and back is the thing nobody
   else has, and without it the provenance claim narrows to a transaction list.
   - Printing itself stays simulated. No parcel is posted, and the README and
     the demo say so.
   - The contract checks the code itself against a hash of token id, print cycle
     and code, as ADR-040 decided. It must never compare a caller-supplied hash
     with a stored one: that is the v1 flaw ADR-036 records, where the hash could
     be read from chain and passed straight back.
   - A locked card rejects every transfer and burn path.

5. **Sub-account names carry no personal data.** ADR-041 says the readable name
   *is* the on-chain account. That collides with ADR-032, because a name built
   from an email address would publish it permanently, on a chain, where it
   cannot be withdrawn.
   - Sub-accounts are named from the anonymous collector label (ADR-032), an
     HMAC of the user id, and never from an email, username or chosen name.
   - The consequence narrows ADR-041 point 6, and it should be said rather than
     glossed over: on chain a stranger reads a stable, checkable collector label.
     A chosen public name stays an off-chain mapping, which is the same kind of
     table ADR-041 criticised on Monad. What improves is that the label needs no
     table at all.

6. **Scan may show the chain; the game loop may not.** ADR-041 point 6 puts a
   NearBlocks link on every history row, while ADR-002 and the `games` bonus want
   a chain nobody notices. Both hold, because they apply to different moments.
   - Revealing, buying, dismantling and trading show no chain word and no wallet
     action.
   - Scan is where a stranger goes to check, by choice. Each row carries one
     plain "check independently" link. It stays free of the word "wallet", and
     ADR-002's rule that consumer surfaces offer no wallet action is unchanged.
   - "Verified authentic" and "Signature validated" do not carry over in any
     form, unless a real read backs them.

7. **The fast-forward shows what is true of this economy.** The `games` track
   says economies that evolve without a dev patch. Store prices here are fixed by
   rarity (ADR-038) and are not changed for this hackathon.
   - What moves is the player market: listing prices and sold prices (FVM), cards
     destroyed, Crystal created. Those are what the simulation shows.
   - It is committed to the repository and runs the same pricing and dismantle
     rules as the product. The Economy Lab cannot serve here, because it lives
     outside the repository and a judge cannot run it.
   - Do not write or say that the economy adjusts itself. Agent NPCs are a hint,
     not a requirement (Q-011), and are not built.

8. **The README is written to be executed.** Numbered "do X, see Y" steps, no
   marketing, and every claim traceable to code a screen can check. It covers:
   - prior work and the diff link (Q-002, Q-003);
   - reused libraries and AI-written code (Q-005);
   - what is simulated: payments and printing;
   - a LICENSE file (Q-014).

   The local mode must run without a MongoDB account, a Google client or a funded
   key held by the judge. `MemoryStoreRepo` and `ENABLE_DEMO_LOGIN` already exist
   as starting points, and how far they reach is unverified until it is built. A
   hosted demo is a plus (Q-012) and, if built, stays up through 25 November.

9. **Nothing irreversible happens without the human.** `HACKATHON.md` lists these
   and they are adopted here: making the repository public, pushing, the X post,
   the payout account, mainnet actions, and the submission itself, whose full
   payload is shown and confirmed first. Each repository can be submitted once;
   later corrections go through a request the organizers review by hand.

10. **Before the first public push, the tree and history are checked for
    secrets.** A pattern scan on 5 November flagged 15 files. Those hits have not
    been reviewed and most may be transaction hashes or local-chain test keys, so
    this records a job to do, not a finding. Internal documents the current
    `.gitignore` keeps out, including `MEMORY.md` and `sessions/`, stay out.

**Target**: repository public and demo post up by 13 November, leaving a day
before the deadline for anything that goes wrong. This is a working target, not a
rule of the hackathon.

**Honest limits, for the README and for anything said aloud**:
- NEAR does not solve ADR-036. It removes the contract-level backdoor and leaves
  the custodial key store (ADR-041).
- For a custodial user Gachard holds the full-access key. Only a self-custody
  user gets the protocol guarantee, and self-custody is out of scope here, so the
  demo must not claim that guarantee for its own users.
- ADR-041's plan to take rotation seeds from the contract's own randomness still
  has to be read in the NEAR docs before its guarantee is claimed.

**Not decided here**:
- Whether NEAR is an exercise or the real v2 chain (ADR-041). ADR-040 stays as it
  is, and the Monad work resumes where it paused.
- Whether Monad Metropolis permits the same project to enter elsewhere. Still not
  checked, and it should be before submitting.
- The payout account and team details, which are the human's to give.
- Whether to host at all, which depends on time left after item 5.

**Consequences**:
- **The rules narrow what can be claimed.** Monad features that have no NEAR
  counterpart in the submitted repository are not mentioned as working features.
- **ADR-041 point 8 lands here too.** The false scan claims are not carried into
  the NEAR version. Correcting v1 in the Monad repository remains separate and
  has not been done.
- **The 13 November target costs features.** Decision 3 fixes the order they are
  dropped in, so a late cut is a planned one.

## ADR-043: The Hackathon MVP Is a Creator Release Platform With No Wallet

**Status**: Accepted, 5 November 2026. **Nothing in this ADR is built.** It
replaces the scope and track choice in ADR-042 (decisions 1, 3, 4 and 7). The
rest of ADR-042 stands: the repository and tags, the README rules, sub-account
names, the Scan rule, human confirmation, and the honest limits. It applies to
this hackathon only. ADR-038, ADR-039 and ADR-040 are not amended for the
product beyond it.

**Context**: ADR-042 carried a store, a Crystal economy and a fast-forward
simulation. A judge has minutes, and that scope makes them learn an economy
before seeing the point. The point is one sentence:

A creator or IP owner releases their own TCG, every card is a digital-native
token whose origin and history can be verified and which can be printed, and
their community collects it without meeting a wallet, a gas fee or a chain word.

**Decision**:

1. **The MVP is one path.** Each step leaves something a judge can check.
   1. A creator signs in with no wallet, creates a Series, uploads cards, and
      sets rates and prices by rarity.
   2. A collector signs in, opens a pack, and buys it with simulated Credits
      (ADR-008).
   3. The card page shows the creator, the Series and the history, each history
      row with a "check independently" link to NearBlocks (ADR-042 decision 6).
   4. The collector downloads a print-ready PDF, and the card locks on chain.
   5. The QR in the PDF opens the history of that same token.
   6. The redeem code in the PDF returns the card to digital, with the same token
      id.

2. **Packs: rates from the old system, the purchase rule from the new one.**
   - The creator sets the rates and prices by rarity. The rates are published.
   - Opening is free and card by card. A pack is 5 cards. Its price is the sum of
     its cards' prices and appears only once all five are open (ADR-038).
   - The collector buys or skips. Cards are minted on purchase only.
   - Each account gets a limited number of packs per day, proposed at 3. Without
     a limit a collector could skip until a Legendary appears.
   - **Why not the paid random pack**: a creator platform should not hand every
     creator the pay-random-prize shape ADR-038 exists to remove. This is a design
     argument, not legal advice.
   - **Why not the full ADR-038 store**: a judge will not wait for a 6-hour
     rotation, and slots, refills and Crystal items add nothing to this story.
   - **Consequence, stated plainly**: a buyer sees what they pay for, so the
     purchase needs no verifiable randomness, and none is built. **Do not claim
     the rates are provably fair.** They are published, not proven. No oracle and
     no commit-reveal are in this MVP.

3. **The PDF simulates the print pipeline, and says so.** Page and card follow
   ADR-039: 63 x 88 mm with 3 mm bleed, and the QR in the reserved corner zone.
   - The notice appears before download, in the PDF margin, on the card back in
     the PDF, in the Scan status ("Printed (hackathon demo PDF)"), in the README
     and in the demo post. The card face stays clean, as ADR-039 asks.
   - Scan is the one that counts, because margins can be cropped and files edited.
   - **A PDF can be copied, and its redeem code is visible.** A printed copy proves
     a link to a token, not ownership of it. Scan therefore shows the current
     holder and print cycle. A code from an earlier cycle no longer redeems
     (ADR-005). In production the platform prints and ships, and the code is
     hidden under a scratch layer.
   - The redeem rules in ADR-042 decision 4 carry over: the contract checks the
     code itself, and a locked card rejects every transfer and burn.

4. **Tokens record their origin.** Each token records `seriesId` and `templateId`
   (ADR-039), and each Series records its creator's account. A content hash of the
   artwork on the template is added if time allows, so a silent art change becomes
   detectable (ADR-039 section 7).

5. **Track: `open` and `nfts`. `games` only if player trading ships.**
   - `open` asks for new ways for money and ownership to work together, with chain
     abstraction named as a hint. This is the closest fit.
   - `nfts`: a card carries a print state and a right to redeem, which is ownership
     with behaviour. This reverses ADR-042 decision 1, and only because print and
     redeem are now the centre. It is not an NFT that holds money, so the README
     does not imply one.
   - `games` is judged on the game loop. Without an economy there is little loop.

6. **Out**: Crystal, dismantle, rotation, albums, Limited cards, Crystal items, the
   shelf discount, the fast-forward simulation, the admin console, Privy, AI risk
   scoring, and Series review. ADR-042 had the economy in scope; it goes.

7. **Cut order if time runs short**: player trading first, replaced by sending a
   card to another account, because a history with one owner shows little. Then
   the artwork hash, then hosting, then Google sign-in, leaving demo login only.
   The six steps of decision 1 and the one-command local mode are never cut.

**Honest limits, in addition to ADR-042's**:
- **Provenance is not proof of rights.** The chain shows that a card was released
  by a given creator account, not that this person owns the IP. Series review
  (ADR-039) is out of scope, so anyone in the demo can upload anything. The README
  says so. Hosted, this also means uploads need a decision before it goes public.
- **The creator is custodial too.** "No wallet" means Gachard holds the key.
- The demo's creators and art are demo content. Only 8 artworks exist.

**Not decided here**:
- The packs-per-day number, default rates and price bands.
- Whether Series need any bounds on rates in the MVP.
- Where uploaded artwork is stored, which affects local mode and hosting.

**Consequences**:
- **Less of the existing code is reused, and it matters less.** Only NEAR work is
  judged (Q-002), and this path touches far fewer routes than the store plan.
- **The Economy Lab and the v2 store are unused here.** They remain the product's
  plan. If this MVP's pack rule is adopted beyond the hackathon, that needs its own
  ADR, since it drops rotation and commit-reveal from ADR-038 and ADR-040.


**Amendment, 5 November 2026: what was cut, and two things learned while building.**
- **Player trading is cut, from the start of the build.** Sending a card to another collector replaces it, as decision 7's cut order allows, so `games` is not a track for this entry. A price paid on a trade would have been in simulated Credits, which adds nothing a judge can check.
- **Everything else in decision 1 is built** and was exercised end to end in a browser: sign-in, a creator's series and card upload, pack, purchase, record, print, PDF, redeem by a second account.
- **Burn is not in the contract.** Dismantle is out of scope (decision 6), and a method that does not exist cannot be misused.
- **The redeem code is stored encrypted before the lock is sent**, because a lock whose code was lost could never be redeemed. So the app checks the holder itself before storing it, or a stranger's print request would overwrite the holder's code. The contract alone would have refused the lock, but after the damage.
- **A refused meta transaction refunds its 1 yocto deposit to the user who signed it**, not to the platform that attached it. This is inferred from exact balance changes in `near-e2e/e2e.mjs`, not read in a specification. It is dust, but it means a user's balance can rise.

**Amendment, 5 November 2026: the landing page speaks to collectors.** The author asked for it: a visitor should first be able to find a favorite and collect. The creator path is unchanged and is the page's closing section. So the page leads with search and categories, and a series has an off-chain `category`. The hackathon entry itself is still a creator release platform, and the README says so. The author then asked for the page to run Hook, Empathy, Solution, Engage, so the search stays at the top, and the categories and series list moved below the explanation, above the creator section. The worries it names are written as statements, not quotes, because no user research stands behind them.

## ADR-044: A Hosted Demo on Vercel, With MongoDB and No Image Library on the Server

**Status**: Accepted, 5 November 2026. Built and verified on Vercel: `near-e2e/app-flow.mjs` passed against the deployed URL with Atlas on 5 November 2026.

**Context**: the first deployment to Vercel returned 500 on the home page. The log showed `Could not load the "sharp" module`, because `libvips` did not reach the function. Fixing that alone would have left a site that could not sign anyone in: ADR-043 stores data in a JSON file and artwork on disk, and a serverless function has neither a lasting disk nor one process.

**Decision**:

1. **Two stores behind one interface.** With no `MONGODB_URL`, the JSON file stays, so `npm run demo` still needs no account. That is what a screener runs. With `MONGODB_URL`, data lives in MongoDB. ADR-017's Atlas choice carries over, in a new database: this one does not share data with the Monad product.
2. **All app data is one versioned document.** A write compares the version and reruns if it lost a race. It is the smallest change from the file store, and it is a demo-sized design: every write rewrites everything, and a document is capped at 16 MB. It was tested with 40 concurrent writes, none lost. Do not carry it beyond the hackathon.
3. **The server does not decode images, and `sharp` is gone from it.** The browser converts an upload to JPEG on a canvas, and the server checks the file type and size and stores the bytes. Tracing the native library into the function could have worked, but it could only be tested by deploying, and removing it removes the failure. `sharp` remains a dev dependency for the seed script only.
4. **Open uploads stay, with caps.** ADR-043 said uploads need a decision before going public. The creator path is the point of this demo, so it stays open: 3 series per account, 20 cards per series, 10 series and 60 cards per hour, 4 MB per image. **This does not stop a person publishing something they should not.** There is no review and no takedown tool, and anything published stays on the chain. If it is abused, the response is to take the hosted site down.
5. **Platform transactions retry on `InvalidNonce` and on a missing access key.** Instances can pick the same nonce, and a new account's key can take a moment to reach the RPC node. In both cases nothing reached the chain, so resending is safe. Nothing else is retried: ADR-031's warning about blind retries still stands. The missing-key case was found when setup failed once on a clean run.

**Consequences**:
- **The signup and upload caps are approximate.** They read then write, so two instances can overshoot slightly. They limit damage, not exact counts.
- **The platform key and encryption secret now live in Vercel**, beside the database URL. That is ADR-036's warning again: whoever gets that environment holds every custodial account. Testnet only, with a throwaway account.
- **A mint whose response is lost holds the buyer's Credits** as `unresolved`, as before. A function killed mid-mint can now cause this as well.

## ADR-045: A Printed Card Belongs to an Account, and Returning It Takes the Physical Card

**Status**: Accepted and built, 5 November 2026, on testnet contract `cards-v2`. Replaces the print and redeem rules of ADR-043, decision 3, for this hackathon. The rest of ADR-043 stands. Exercised by `cargo test` and `near-e2e/e2e.mjs`, and by `near-e2e/app-flow.mjs` locally and on Vercel.

**Context**: under ADR-043 a printed card carried a redeem code, and whoever entered the code received the card. That made the paper a bearer instrument: a photo of the code was enough to take the card. It also meant a printed card could not change hands on the record. The author wants the opposite risk: a physical card can be lost for good, and nobody who finds or steals it can do anything with it.

**Decision**:

1. **There is no redeem code. The QR code only opens a card's record.** Anyone who scans it sees the card and its holder. Only the holder, signed in, sees Transfer and Return to digital.
2. **A printed card can be transferred, by its holder only, to a username.** It stays Printed. The paper changes hands outside the system.
3. **Returning to digital means sending in the physical card.** The holder calls `request_return`, which stops the card moving while it travels. The minter then calls `confirm_return` once it has received and destroyed the card, or `reject_return` if it is not genuine. Neither side can do it alone, and neither call changes the holder.
4. **A lost or stolen card can never return,** because there is nothing to send. This is deliberate. The holder can still transfer the record, so a buyer must check the physical card as well as the name on the record.
5. **Each print has a random serial, carried in its QR code, with its hash on chain.** `print_state` answers Active, ReturnPending, Void or Unknown. A returned card's old paper reads VOID for good. Only one print of a card is ever current.
6. **Usernames are app data, unique, and off chain.** Chain accounts stay anonymous HMAC names (ADR-042, decision 5). A new account gets an anonymous default username and can change it.
7. **Printed cards cannot go through `mt_transfer_call`.** A refund could not tell a card printed all along from one printed during the call, and nothing in this app needs it.

**Why not a code plus login, or one-way printing**: a secret on the card, required together with the holder's login, can be defeated by photographing it before the card is lost. One-way printing has no such gap, but takes the way back from a holder who still has the card. Sending in the card is the only one of the three that proves possession without new hardware.

**What the demo does not prove**:
- **The physical step is simulated.** Nothing can be posted during judging, so the holder sees labelled "Simulate" buttons that make the platform's real testnet transaction. In the demo a holder can therefore return a card they no longer have. The contract enforces who can act, not where the paper is.
- **A copy of a current print scans the same as the original.** A QR code proves a link to a record, not that a piece of paper is genuine. Production needs platform printing with physical security features, or a chip that cannot be cloned, or `reject_return` has nothing to judge by. A self-printed PDF cannot have them.
- **The holder can download the PDF again**, including a new holder. In production there is no PDF.
- **The platform is trusted on the physical step.** Its confirmation is on chain, but the public cannot check that a card was really received and destroyed.
- **A username is not on chain.** The link from a username to a chain account is the app's word. Scan shows both so they can be compared with the record.

**Consequences**:
- **The contract's storage layout changed,** so it is a new deployment and earlier testnet cards stay on the old contract.
- **Printing no longer moves a secret.** The database stores the serial so the PDF can be downloaded again, in plain form, because it is printed in a public QR code.
- **Giving a card to someone without an account is no longer possible.** The recipient needs a username first.
- **A contract's balance has to cover its own code.** The wasm alone takes 2.81 NEAR of storage. The redeployment was funded with 3, and purchases failed with `LackBalanceForState` once about 12 KB of state had filled the rest. It was caught by running `app-flow.mjs` on the live site after the series were published. The contract now holds 8 NEAR, and that error now returns the buyer's Credits, because a rejected transaction minted nothing.

---

## ADR-046: A Small Economy: A Revenue Split, Dismantle, Crystal and One Shop Item

**Status**: Accepted, 6 November 2026. Amends ADR-043, whose decision 6 put Crystal and dismantle out of scope and whose amendment said burn is not in the contract. The author asked for this after reviewing how the product earns.

**Context**: pack sales took Credits from the buyer and gave them to nobody, so "revenue share" was only a sentence on the creator page. A collector could also skip until a pack looked good, and a pack with one good card and four duplicates was a poor buy. ADR-024, ADR-026, ADR-035 and ADR-038 designed an answer for the Monad product. ADR-043 removed it because a judge has minutes. This takes the smallest part that closes the loop.

**Decision**:

1. **Every pack sold is split, and the record is derived.** The creator gets 90% and Gachard 10%, in simulated Credits. The figures are computed from bought offers, so they cannot drift from what was sold, and the creator studio shows them. Nobody is paid. The percentages are examples, not a business decision.
2. **Dismantle is a real burn.** The holder's own account signs `burn`. Only a digital card can burn, so a printed card has to come back first, and a physical card can never outlive its token. The token keeps its record and history as `Burned`, its supply becomes 0, and it leaves its holder's list. No method lets the platform burn a card.
3. **Crystal is a number off chain.** It is created only by a burn, fixed by rarity at 10, 30, 90 and 300. It cannot be bought or cashed out, and it cannot be sent to anyone. The yields are examples.
4. **The shop has one item.** 50 Crystal buys one extra pack slot, used when a day's limit of 3 is reached. A slot does not buy a card: the buyer still sees all five cards before paying, as in ADR-043 decision 2.
5. **Crystal trading between collectors is out.** It would invite selling Crystal for real money off the platform, and it would need the abuse controls of ADR-024 and ADR-025. It stays a written plan.

**Why an upgrade and not a new contract**: the state layout does not change. `Burned` is added at the end of two enums, which Borsh stores by index, so the same account takes the new code and every existing card survives. ADR-045 needed a new deployment because its layout changed. This one does not.

**Honest limits**:
- **Crystal does not earn anything by itself.** It gives a reason to buy another pack, and pack sales are the revenue. Whether it works is untested, because there are no real collectors.
- **The pack limit is per account and per series.** New accounts and other series get around it, which a real launch would need to close.
- **Crystal is custodial.** It is a number the app holds, and only the burn behind it can be checked on chain.
- **A burn is credited after it lands.** If the response is lost, asking again finds the burned card and credits it once, keyed by token id.

**Consequences**:
- The contract is redeployed in place on testnet, so the running site keeps working during the change.
- The concept comes from the Monad product, and the README discloses that. The burn and the app code are new, for NEAR.

**Amendment, 6 November 2026: series progress instead of an album.** The author asked whether the album of ADR-038 belongs here. It does not: its permanent lock would stop a card being printed, which is this entry's point, and it brings seasons, limited cards and the Wish Card with it. My Cards shows how many of a series' cards a collector holds, and which are missing. It is derived from what they hold, so it needs no contract change and cannot drift. Nothing is locked and nothing is won, which also keeps it clear of collecting a set for a prize. A holder is warned before dismantling their only copy of a card. Whether this makes anyone buy another pack is untested.

---

## ADR-047: Demo Series With Generated Art, and Retiring the Old Ones

**Status**: Accepted, 6 November 2026.

**Context**: the demo series were drawn in code and looked it. The author generated better art with ChatGPT: four series of eight cards, with logos. A card's name and art hash are immutable on chain, so old cards cannot take new art.

**Decision**:

1. **Four new series, released as new.** Mochi Puffs, Aika Nova, Luma Four and Thornmaw Wilds, each with 4 Common, 2 Rare, 1 Epic and 1 Legendary. Luma Four replaces Noa Vantor. Thornmaw Wilds replaces Crystal Night.
2. **Old series are retired, not deleted.** A `hidden` flag in the app's data takes a series off the listing and stops new packs. Its page stays reachable, because cards already bought stay valid and link to it. Nothing changes on chain.
3. **A new frame for print.** The border and text sit inside the 63 x 88 mm trim, and the QR zone in `lib/pdf.ts` is empty but for a faint star. Each card carries its series logo, cut out of its white background by `make-series-logos.mjs`.
4. **Only optimized images ship.** About 75 MB of originals stay out of the repository. The site gets 800 x 1120 JPEGs of about 120 KB.
5. **Each card says "AI art made for this demo".** The old line, "Art drawn for this demo", would no longer be true.
6. **A Gachard card back.** The old back carried the name "Eclipse Prime" from earlier artwork. The new one is drawn in code by `make-card-back.mjs`, and its mark and name stay above the panel the print PDF adds.

**Honest limits**:
- **Likeness cannot be proven absent.** The monsters are in a familiar genre, and a reverse image search lowers the risk of resembling an existing design without removing it.
- **Retiring is the app's word.** The contract does not know about `hidden`, so a retired series could still be minted to by the platform.
- **Open packs survive.** A pack opened before a series was retired can still be bought.
- **Released twice.** The first release put each logo on a white chip inside the card image. The image is immutable on chain, so removing the chip took a second release under the same names. The first four series, 21 to 24, are retired, and only their ids tell them apart on chain.

**On screen, a series' name loses its note.** "(fictional ...)" stays in the name on chain, and moves into a Fictional IP label beside the name on screen. The card's face and the home page still say so in words.

**On screen, a framed card shows from its border out.** The dark margin exists for the print trim. `lib/framed-art.ts` recognises Gachard's own framed cards and crops the display only, which stretches them about 4%. A creator's upload has no such margin and is shown whole. The image and its hash do not change.

**A Gachard QR with a short address.** A printed QR is drawn in the brand's colors with the crystal star in the middle (`lib/qr-style.ts`). It points to `/S/<token>/<SERIAL>`, in capitals, which a QR stores in fewer bits. That takes a long print address from 37 modules across to 33, and each one prints larger. `/S/` redirects to the card's record, and QRs already printed keep working. Its limit: this has only been tested with a software reader on rendered images, not yet a phone camera on paper.

---

## ADR-048: Back to a Paid Pack, and Crystal Trades for a Card

**Status**: Accepted, 6 November 2026. Supersedes ADR-043 decision 2 and the free reveal of ADR-038 in this repository. Replaces the extra pack slot of ADR-046.

**Context**: the author asked to return to the card pack people already know. Opening for free and buying afterwards is harder to explain, has nothing at stake in the opening, and lets a buyer pick only the good packs. The author also asked what Crystal would then be for.

**Decision**:

1. **Pay, then open.** A pack has one price. The buyer pays, five cards are drawn at the series' published rates and minted, and turning them over is only a reveal.
2. **The price is derived.** It is what five cards are worth on average at the series' rates and card values, rounded down. A series at the demo's figures comes to 500 Credits. The chain and the creator's form do not change.
3. **Crystal trades for a chosen card.** A trade costs five times what a card of that rarity yields: 50, 150, 450 and 1,500 Crystal. It mints a new card, so it needs no contract change. Trades are not sales and do not count as revenue.
4. **The skip, the daily limit and the extra pack slot are gone.** A slot only made sense while a limit did. Packs already opened and never bought stay uncharged.

**Honest limits**:
- **This is the shape ADR-038 was written to avoid.** Pay, random, and a prize of money's worth is what some regulators treat as gambling. Here Credits are simulated, on testnet, and nothing can be cashed out. Before real money, this needs legal review in each target market. It is not legal advice.
- **A buyer now depends on the draw, and cannot check it.** It is a server-side random choice. The rates are published, not proven.
- **"Pay only for what you see" is gone**, and it was a real differentiator.
- **No limit protects the platform's gas.** Credits limit one account, but demo accounts are free. The daily limit was per account and did not close this either.

**Amendment, 6 November 2026: the home page drops its worries section.** The author removed the section that named collectors' worries and answered them, along with the amendment to ADR-043 that ordered the page as hook, empathy, solution, engage. The page now goes from the hero to printing, then to the series.

**Amendment, 7 November 2026: several cards at once, and a lock.** My Cards can dismantle several cards in one go. The collector reviews what each rarity yields and a warning that it cannot be undone. Each card is still its own burn, signed in turn, so a failure partway leaves the earlier ones destroyed and says how many. A collector can also lock a card, for every copy of that design. The lock is in the app's data and only stops the app's dismantle: the holder's custodial account could still burn on chain, and a locked card can still be printed or sent.

**Amendment, 7 November 2026: a Crystal Shop.** The Crystal Shop page holds what Crystal is spent on: a chosen card, and a Crystal Pack of five cards at 300 Crystal. A pack gives back about 131 Crystal on average when dismantled, so buying packs with Crystal cannot make more Crystal. A Crystal Pack is not a sale and counts as no revenue. It still mints on the platform's gas, so Crystal cannot be bought, sent or cashed out remains the limit on it. Later additions such as weekly deals and cosmetics were left out to protect the submission.

**Amendment, 7 November 2026: a series can be edited, and a card cannot.** A creator can change a series' title, logo, description, category, odds and card values at any time. The title, odds and values are on chain, so the contract gains `update_series`, which only that series' creator can call and which emits `series_updated`. The stored layout does not change, so the contract is replaced in place, as it was for `burn`. Limits: a creator can change the odds while a series is selling, which only affects later packs. The series page says when they last changed, and the events keep every value, but nothing stops a creator lowering them after a promotion.

**Amendment, 7 November 2026: cards are drafts until published.** Adding a card used to write it to the chain at once, and a series went live as soon as its last rarity had a card, so a typo was permanent before anything was released. A card now starts as a draft in the database: its creator can rename it, replace its image, change its rarity or remove it. A Publish button, enabled once every rarity with odds has a card, writes the drafts with `add_template` and the series goes live. A card added to a live series is a draft too, published the same way. The contract does not change. Publishing is one transaction per card, so a publish that stops part way leaves the rest as drafts and can be repeated. Each draft is claimed while it is written, and a claim older than a minute is checked against the chain first, so a card is not written twice. Limits: drafts are not on chain and have no public record until published, their images can be fetched by anyone with the address, and a series can be briefly on sale with some of its cards while a long publish finishes. Cards published before this stay as they are.

**Amendment, 7 November 2026: a creator can delete a series.** With no published card, its row is removed and its page is gone. With a published card it is retired rather than removed: it leaves the studio and the lists, sells no packs or trades, and its page stays open by address marked as retired, because a collector may hold a copy. The app cannot tell that nobody does, since Crystal trades mint without an offer record. Either way it stops counting against the creator's limit, and the chain keeps its entry and any cards, so "delete" means gone from Gachard, not erased. Limits: deleting cannot be undone in the studio, and a creator can retire a series that collectors are still completing, who then cannot trade for the missing cards.

**Amendment, 7 November 2026: Gachard frames a creator's cards.** The frame on the demo series is baked in by a script, so a series released through the studio looked unfinished beside them. The studio now draws a frame in the browser when a card is added, on by default: the rarity's colours, the name, the series, its logo, who released it and an optional line of text. The server still decodes nothing (ADR-044). The art fills the frame with the text on dark fades, because the demo layout's near-square art window would cut about a third off the tall images creators generate. So it matches the demo cards in its parts and print zones, not exactly in its look. A draft keeps the unframed art, so its frame is redrawn when its name or the series' name or logo changes, and "?framed" on the media address marks the image for showing without its print margin. The address is on chain, but the bytes and the hash are unaffected. A creator can switch the frame off to use their own design. Limits: the frame is drawn by the browser, so a server does not check what it says, and a published card's frame cannot be updated: a later rename of the series leaves it showing the old name.

**Amendment, 7 November 2026: limits per user, after an audit.** An audit found that one free account could stop the site, because a card lock's reference had no length limit and is stored in the one state document, and that an edit with empty odds never reached the contract yet still set a pack's price and draw. Both are now validated with the contract's own rules. The caps of ADR-044 were global, so one visitor could use up everyone's signups and uploads, and a contract with about 2 NEAR free could be drained in under an hour. They now sit behind limits per user or per visitor (lib/limits.ts), counted in the state document, with visitors kept as a keyed hash of their address. Uploads, logos included, also have a byte budget and stop before the database fills. Writes from another site are refused by Origin, and a login redirect stays on this site. Pictures of small cards come from the host's image optimizer, which runs outside our functions, so ADR-044 holds. Limits: these slow an attacker and do not stop one with many addresses, a shared office shares its limit, requests with no Origin are allowed because they carry no visitor's session, and the optimizer has a monthly quota on the host's free plan. A public RPC's 429 used to fail the page or action. Chain calls now retry with a pause and use a second provider's RPC for a minute, which means trusting that provider's answers while it is in use, and a real outage of both still fails. A printed card is now traded by both people: the new owner scans its QR and asks, gets a four-digit code, and the holder types that code to approve, so their account signs the transfer. A digital card still moves by username alone, since receiving one costs nobody anything, and a collector's lock now stops transfers as well as dismantling. Typing is used over comparing two codes, because a tap can be careless. Several requests can wait on one card, so a stranger's scan cannot block a real buyer. This is app policy and the contract does not change: a holder's account can still transfer alone at the contract, and payment stays outside with no escrow. Before mainnet: separate keys for platform and contract, keys derived per purpose, and sessions that can be revoked.
