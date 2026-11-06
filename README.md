# Gachard

A platform where a creator or IP owner releases their own trading card game. Every
card is digital from birth, can be verified by anyone and can be printed. Their
community collects it without meeting a wallet, a seed phrase or a gas fee.

Built for NEAR HACKATHON. Tracks: `games`, `nfts`, `open`.

- **Hosted demo:** https://gachard-near.vercel.app (testnet, simulated payments)
- **Contract:** [`cards-v2.gachard-demo-6b9aead4.testnet`](https://testnet.nearblocks.io/address/cards-v2.gachard-demo-6b9aead4.testnet)
- **Prior work is disclosed** [below](#prior-work). What is simulated is listed [here](#what-is-simulated-and-what-is-not-claimed).

## The problem

A creator who wants verifiable collectible cards has to send their community through
wallets, gas fees and seed phrases, and most of that community stops there. Gachard
moves all of that behind an ordinary sign-in.

A digital card can also become a physical one, and that creates a second problem: paper
can be copied, lost or stolen. Here the paper never carries ownership. A QR code only opens
the card's record, only the holder's account can transfer it, and returning it to digital
takes the physical card, so one that is lost or stolen stays lost.

## How NEAR is used

| What | How | Where |
|---|---|---|
| Cards | NEP-245 multi tokens, one token id per card, supply 1 | [`gachard-cards/src/lib.rs`](gachard-cards/src/lib.rs) |
| Who released a card | The creator's own account signs `create_series`, `update_series` and `add_template` | same |
| No gas for users | NEP-366 meta transactions: the user signs, the platform pays gas and the 1 yocto deposit | [`frontend/lib/near.ts`](frontend/lib/near.ts) |
| No wallet | A named sub-account per user, created at sign-in | same |
| No method lets the platform move a card | Only the holder's own call moves one. See the limit on the contract's key [below](#what-is-simulated-and-what-is-not-claimed) | contract tests |
| Print and return | A printed card stays with its holder's account. Returning takes the holder's request and the platform's confirmation, under the same token id | contract, `print_lock`, `request_return`, `confirm_return` |
| Dismantle | The holder's own account burns a digital card. Its supply becomes 0 and its record stays. A printed card has to come back first, so a physical card never outlives its token | contract, `burn` |
| A QR for each print | The chain keeps a hash of each print's serial, so anyone can tell a current print from a cancelled one | contract, `print_state` |
| Public proof | The Verify page reads the contract live, and each history row links to NearBlocks | [`frontend/app/scan/[id]/page.tsx`](frontend/app/scan/[id]/page.tsx) |

## How it earns

Pack sales are the revenue. Each pack sold is split between the creator and Gachard, and the creator studio shows the figures.

A pack has one price, and the buyer pays before the cards are drawn, as in most card games. Its odds are on the series page. Duplicates are not wasted: the holder dismantles a digital card, the burn gives Crystal, and Crystal trades for a card they are missing.

My Cards also shows how much of each series a collector holds, and which cards are missing. Nothing is locked or won for finishing one.

Crystal is created only by a burn, and it cannot be bought, sent or cashed out. The 90/10 split, the pack price, the yields and the trade prices are examples for this demo. A paid random pack with a prize of money's worth is what some regulators treat as gambling, so this needs legal review before it takes real money (ADR-048). Whether this loop works is untested, because there are no real collectors. See [ADR-046](DECISIONS.md).

## Try it

The steps below work on the hosted demo too. To run your own copy, you need Node 22.22 or
later and internet access. You need no account, key or funds:
setup creates a throwaway testnet account from the public faucet, deploys the contract
from the committed wasm, and publishes a demo series with real transactions. Allow
about three minutes.

```bash
cd frontend
npm install
npm run demo
```

Open http://localhost:3000, or the hosted demo, then:

1. **Sign in.** Click Sign in, then Continue with a demo account. You see 5,000 Credits and
   no wallet prompt.
2. **Open a pack.** Open the Series tab, or search and filter on the home page. Open Thornmaw Wilds. You see its odds and one pack price.
3. **Buy.** Click Buy a pack. Credits fall by that price, and five cards are minted to your
   account.
4. **Open.** Open the sealed pack, then click Open all to turn the cards over. The rarest comes last.
5. **Verify.** Click Print or verify the first card. You see the holder, who released it, and
   whether the artwork file matches the public record. Click View on NearBlocks: it
   shows the same transaction, outside this app.
6. **Print.** Click Print this card, read the simulation notice, then Print and create PDF. The status
   reads Printed (hackathon demo PDF). Click Download print PDF: it holds the card and a QR code. The address the QR opens is printed at the foot of each page.
7. **Scan as someone else.** In a private window, sign in with a new demo account and open
   that address. You see the card and its holder, and nothing to press. Your username is under
   My Cards, and you can change it there.
8. **Transfer, then return.** Back as the holder, enter that username, then click Continue and Transfer. It
   stays printed, and its history updates. As the new holder, open the card and click Return to digital, then
   Request return. A button stands in for posting the card: click Simulate: card received
   and destroyed. The same token id is digital again. Open the QR's address once more: it
   now reads VOID.
9. **Dismantle a duplicate.** Open a digital card and click Dismantle, then Destroy. Its record stays and says it was destroyed, and My Cards shows your Crystal. The Crystal Shop, linked from My Cards, trades Crystal for a card you are missing or for a whole pack. On the All cards tab, Dismantle cards selects several at once, and the lock on a card keeps it from being dismantled.
10. **Release your own.** Open For Creators and add a series. Add a card for each rarity that
   has a rate: Gachard frames your image in the browser, and the card stays a draft you can edit or remove. Click Publish series: each card is written to the chain and can no longer change, and the series goes live on the home page. You can still edit the series, or delete it. On any of its cards, Released by links to your account on
   NearBlocks. After a sale, the series shows the 90/10 split in simulated Credits.

### Check each claim

| Claim | How to check | What passes |
|---|---|---|
| Users pay nothing and need no wallet | `e2e.mjs`, below | `paid nothing` for each account, from its exact balance |
| No method lets the platform move a card | `cargo test platform_cannot_move` | The test passes |
| Having the paper gives no power | `cargo test finder_of_a_printed_card` and `e2e.mjs` | Tests pass. `e2e.mjs` prints `Someone with the paper but not the account cannot move it` and `cannot return it` |
| The platform cannot return a card nobody asked to return | `cargo test platform_cannot_return` | The test passes |
| A returned card's old QR reads VOID | `cargo test print_state_follows_the_card` and `app-flow.mjs` | The test passes, and `app-flow.mjs` prints `The old QR reads VOID` |
| A card cannot change once published, and a draft can | `app-flow.mjs` | `The creator renames a draft` and `A published card can no longer change` |
| Odds that do not add up to 100% are refused | `app-flow.mjs` | `An edit with empty odds or values is refused` |
| Another site cannot sign a visitor in | `app-flow.mjs` | `A sign-in sent from another site is refused` |
| The art matches its hash on chain | `app-flow.mjs` | `Artwork matches the chain's hash` |
| The Verify page can be checked outside this app | Click View on NearBlocks on a history row | The transaction on NearBlocks. A row with no saved hash links to the contract instead |

### Prove it without a browser

With the setup above done, this runs the whole path against testnet and fails if a user's
balance falls by a single yoctoNEAR, if the platform can move a user's card, or if someone
with the paper but not the account can move or return one.

```bash
cd near-e2e
npm install
node --env-file=../frontend/.env.local e2e.mjs
```

The last recorded run, with its transaction links, is in
[`near-e2e/last-run.json`](near-e2e/last-run.json).

To run the whole app path over HTTP against any running copy, local or hosted, including
a pack, a print, a PDF, a transfer, a return and a creator upload:

```bash
cd near-e2e
node app-flow.mjs http://localhost:3000
```

It makes real transactions, and creates two accounts and a series named `Flow <time>`, kept off the public lists,
on whichever copy it runs against, so prefer a local one. Limits apply per visitor per hour (10 new accounts, 40 packs), so running it many times in an hour from one address will start to be refused.

### Contract tests

Needs Rust, and `cargo-near` for the build. `--no-abi` is required on Windows.

```bash
cd gachard-cards
cargo test
cargo near build non-reproducible-wasm --no-abi
```

## What is simulated, and what is not claimed

- **Payments are simulated.** Credits are a number in the app's database. The creator's share is a figure derived from sales: nobody is paid.
- **Crystal is a number the app holds.** Only the burn behind it can be checked on chain. Crystal trading between collectors is not built.
- **Printing is simulated.** The PDF stands in for the card the platform would print and
  ship. It says so in its margin and on the card back, and the Verify page says so too.
- **Sending a card back is simulated.** In production the physical card goes to Gachard to be
  destroyed, so a lost or stolen card can never return. Nothing can be posted in a demo, so
  labelled buttons stand in for that, and they make the real transaction. **So in this demo a
  holder can return a card they no longer have.** The contract enforces who can act, not
  where the paper is. Production also trusts Gachard on this step: its confirmation is on
  chain, but the public cannot check that a card was received and destroyed.
- **A QR does not prove paper is genuine.** A copy of a current print scans the same as the
  original. What it cannot do is move the card: only the holder's account can. Production
  needs platform printing with physical security features. A self-printed PDF cannot have them.
- **Usernames are not on chain.** The link from a username to an account is this app's word.
  The Verify page shows both, so they can be compared with the record.
- **The hosted demo's Mochi Puffs, Aika Nova, Luma Four and Thornmaw Wilds series are invented.**
  They show the kinds of creator this is for, and are not clients. The people and creatures
  are fictional. Each card says so on its face, and each series carries a Fictional IP label. Their art was generated by an AI image
  service, ChatGPT by OpenAI (the exact image model was not recorded), from the prompts in
  [`docs/demo-art-prompts.md`](docs/demo-art-prompts.md). The cards are framed by
  [`make-series-art.mjs`](frontend/scripts/make-series-art.mjs) and published by
  [`seed-demo-ips.ts`](frontend/scripts/seed-demo-ips.ts). The monsters are new designs in a
  familiar genre, and a generator can still land near an existing design.
- **Earlier demo series are retired, not gone.** Crystal Night, the first Mochi Puffs, Aika
  Nova and Noa Vantor series, and a first release of the current four are off the listing and
  sell no new packs. Their records stay on
  chain, and their cards can still be held, scanned and printed.
- **Rates are published, not proven.** The draw is a server-side random choice, and a buyer
  depends on it, because they pay first. Nothing here lets them check the draw was honest.
- **Provenance is not proof of rights.** The chain shows which account released a card, not
  that the account owns the IP. Nothing is reviewed in this demo. The platform also mints on
  a creator's behalf and can mint any amount from their templates.
- **Users here are custodial.** Gachard holds each account's encrypted key. The contract
  stops the platform's own account moving cards, but whoever holds the custodial key store
  could sign as those users. This is the honest limit of "no wallet".
- **The platform could replace the contract.** The contract account still has a full-access
  key, the same one the platform uses, so it could deploy different code. "No method moves a
  card" describes this contract, not a promise about what its deployer could do later.
- **Testnet only.** Cards have no cash value.
- **Data stores.** Locally, app data is a JSON file for one Node process. Hosted, it is one
  MongoDB document with artwork alongside. Both are demo-sized.
- **A card frame is drawn by the creator's browser.** The server does not check what it says. A published card keeps its frame, so renaming the series later leaves the old name on it.
- **Deleting a series does not erase it.** It leaves Gachard, and a series with published cards stays open by its address, marked as retired. The chain keeps its entry and its cards.
- **Uploads are open and unreviewed**, with caps per account and per hour. Do not read a
  series on a hosted demo as endorsed by anyone.
- **`next build` downloads Google Fonts** and failed once on a transient network error. The
  local demo runs in dev mode, which falls back to system fonts.

## Prior work

This is disclosed as the hackathon rules ask (Q-002, Q-003).

- The concept, the original card artwork, the Crystal Night design system and the decision log
  were made earlier for a Monad Testnet version of Gachard. The four demo series now on the
  listing use art generated during the hackathon.
- Commit `c374d51`, tagged `pre-hackathon`, is an import of that codebase. It is dated inside
  the window, but none of it is hackathon work.
- **What was built for this hackathon is the
  [diff from `pre-hackathon` to `hackathon-submission`](https://github.com/Gihasy/gachard-near/compare/pre-hackathon...hackathon-submission).** That covers the contract, all NEAR integration, the new app and
  the end-to-end check. Solidity, `ethers`, Pyth and Privy were removed.
- The idea of dismantling cards for Crystal comes from the Monad version. The contract's `burn` and all the app code for it were written here, for NEAR.
- Reused from the baseline: the visual tokens in `frontend/app/globals.css`,
  `frontend/lib/crypto.ts`, `frontend/lib/session.ts` (in part), `frontend/components/Logo.tsx`,
  `design/gachard.pen`, `docs/CREATOR-ASSET-GUIDE.md`, and the images in `frontend/public`,
  including the pack art, relabelled for this version. The "One card, two worlds" line, the
  scan steps and parts of the creator page's copy come from the Monad site.
- Libraries: `near-sdk`, `near-api-js`, Next.js, React, Tailwind, `pdf-lib`, `qrcode`, `jsqr`, `mongodb`,
  `google-auth-library`, and `sharp` for the art scripts only.
- Much of the code was written with AI coding agents under the author's direction: Claude Code
  here, and MiMoCode for the earlier Monad version (ADR-015).

Why each decision was made is in [`DECISIONS.md`](DECISIONS.md). ADR-041 to ADR-048 cover this
version. Older ADRs describe the Monad product.

## License

[MIT](LICENSE)
