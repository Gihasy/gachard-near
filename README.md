# Gachard

A platform where a creator or IP owner releases their own trading card game. Every
card is digital from birth, can be verified by anyone and can be printed. Their
community collects it without meeting a wallet, a seed phrase or a gas fee.

Built for NEAR HACKATHON. Tracks: `open`, `nfts`.

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
| Who released a card | The creator's own account signs `create_series` and `add_template` | same |
| No gas for users | NEP-366 meta transactions: the user signs, the platform pays gas and the 1 yocto deposit | [`frontend/lib/near.ts`](frontend/lib/near.ts) |
| No wallet | A named sub-account per user, created at sign-in | same |
| Platform cannot take a card | No method moves a card except the holder's own call | contract tests |
| Print and return | A printed card stays with its holder's account. Returning takes the holder's request and the platform's confirmation, under the same token id | contract, `print_lock`, `request_return`, `confirm_return` |
| A QR for each print | The chain keeps a hash of each print's serial, so anyone can tell a current print from a cancelled one | contract, `print_state` |
| Public proof | Scan reads the contract live, and each history row links to NearBlocks | [`frontend/app/scan/[id]/page.tsx`](frontend/app/scan/[id]/page.tsx) |

## Try it

The steps below work on the hosted demo too. To run your own copy, you need Node 22.22 or
later and internet access. You need no account, key or funds:
setup creates a throwaway testnet account from the public faucet, deploys the contract
from the committed wasm, and publishes a demo series with real transactions. Allow
about a minute.

```bash
cd frontend
npm install
npm run demo
```

Open http://localhost:3000, or the hosted demo, then:

1. **Sign in.** Click Sign in, then Continue with a demo account. You see 5,000 Credits and
   no wallet prompt.
2. **Open a pack.** Open Crystal Night: Starter Set, then Open a pack. You see five
   face-down cards and no price.
3. **See before paying.** Click Open all. You see each card and the pack's price, which is
   the sum of its cards' prices. Skip charges nothing.
4. **Buy.** Click Buy this pack. Credits fall by exactly that price and five cards are
   minted to your account.
5. **Verify.** Click Print or verify the first card. You see the holder, who released it, and
   whether the artwork file matches the hash on chain. Click check independently: NearBlocks
   shows the same transaction, outside this app.
6. **Print.** Click Print this card, read the simulation notice, then Print and create PDF. The status
   reads Printed (hackathon demo PDF). Download the PDF: it holds the card and a QR code. The address the QR opens is printed at the foot of each page.
7. **Scan as someone else.** Open that address in a private window, or sign in with a new
   demo account there. You see the card and its holder, and nothing to press. Pick a username
   for that account under Collection.
8. **Transfer, then return.** Back as the holder, transfer the card to that username. It
   stays printed, and its history updates. As the new holder, open the card and click Return to digital, then
   Request return. A button stands in for posting the card: click Simulate: card received
   and destroyed. The same token id is digital again. Open the QR's address once more: it
   now reads VOID.
9. **Release your own.** Open Create, publish a series, and add a card for each rarity that
   has a rate. It goes live on the home page. A record of what your account published is on
   chain.

### Check each claim

| Claim | How to check | What you should see |
|---|---|---|
| Users pay nothing and need no wallet | `e2e.mjs`, below | `paid nothing` for each account, from its exact balance |
| The platform cannot take a card | `cargo test platform_cannot_move` | The contract refuses it |
| Having the paper gives no power | `cargo test finder_of_a_printed_card` and `e2e.mjs` | `Only the holder can transfer`, `Only the holder can return` |
| The platform cannot return a card nobody asked to return | `cargo test platform_cannot_return` | `Card is not being returned` |
| A returned card's old QR reads VOID | `cargo test print_state_follows_the_card` and `app-flow.mjs` | `The old QR reads VOID` |
| A price stays hidden until every card is open | `app-flow.mjs` | `Price is still hidden at card four` |
| The art matches its hash on chain | `app-flow.mjs` | `Artwork matches the chain's hash` |
| Scan can be checked outside this app | Click check independently on any history row | The same transaction on NearBlocks |

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

It makes real transactions, and creates two accounts and a public series named `Flow <time>`
on whichever copy it runs against, so prefer a local one.

### Contract tests

Needs Rust. `--no-abi` is required on Windows.

```bash
cd gachard-cards
cargo test
cargo near build non-reproducible-wasm --no-abi
```

## What is simulated, and what is not claimed

- **Payments are simulated.** Credits are a number in a local file.
- **Printing is simulated.** The PDF stands in for the card the platform would print and
  ship. It says so in its margin and on the card back, and Scan says so too.
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
  Scan shows both, so they can be compared with the record.
- **The hosted demo's Mochi Puffs, Aika Nova and Noa Vantor series are invented.** They show
  the kinds of creator this is for, and are not clients. The people and characters are
  fictional, and their art is drawn in code by [`make-demo-art.mjs`](frontend/scripts/make-demo-art.mjs).
  Each card says so on its face. They are published by [`seed-demo-ips.ts`](frontend/scripts/seed-demo-ips.ts).
- **Rates are published, not proven.** The draw is a server-side random choice. A buyer sees
  what they pay for, so the purchase does not depend on it, but the rates are not provably
  fair.
- **Provenance is not proof of rights.** The chain shows which account released a card, not
  that the account owns the IP. Nothing is reviewed in this demo. The platform also mints on
  a creator's behalf and can mint any amount from their templates.
- **Users here are custodial.** Gachard holds each account's encrypted key. The contract
  stops the platform's own account moving cards, but whoever holds the custodial key store
  could sign as those users. This is the honest limit of "no wallet".
- **Testnet only.** Cards have no cash value.
- **Data stores.** Locally, app data is a JSON file for one Node process. Hosted, it is one
  MongoDB document with artwork alongside. Both are demo-sized.
- **Uploads are open and unreviewed**, with caps per account and per hour. Do not read a
  series on a hosted demo as endorsed by anyone.
- **`next build` downloads Google Fonts** and failed once on a transient network error. The
  local demo runs in dev mode, which falls back to system fonts.

## Prior work

This is disclosed as the hackathon rules ask (Q-002, Q-003).

- The concept, the card artwork, the Crystal Night design and the decision log were made
  earlier for a Monad Testnet version of Gachard.
- Commit `c374d51`, tagged `pre-hackathon`, is an import of that codebase. It is dated inside
  the window, but none of it is hackathon work.
- **What was built for this hackathon is the
  [diff from `pre-hackathon` to `hackathon-submission`](https://github.com/Gihasy/gachard-near/compare/pre-hackathon...hackathon-submission).** That covers the contract, all NEAR integration, the new app and
  the end-to-end check. Solidity, `ethers`, Pyth and Privy were removed.
- Reused from the baseline: the visual tokens in `frontend/app/globals.css`,
  `frontend/lib/crypto.ts`, `frontend/components/Logo.tsx`, and the images in
  `frontend/public`.
- Libraries: `near-sdk`, `near-api-js`, Next.js, React, Tailwind, `pdf-lib`, `qrcode`, `mongodb`,
  `google-auth-library`, and `sharp` for the seed script only.
- Much of the code was written with an AI coding agent, Claude Code, under the author's
  direction.

Why each decision was made is in [`DECISIONS.md`](DECISIONS.md). ADR-041 to ADR-045 cover this
version. Older ADRs describe the Monad product.

## License

[MIT](LICENSE)
