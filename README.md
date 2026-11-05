# Gachard

A platform where a creator or IP owner releases their own trading card game. Every
card is digital from birth, can be verified by anyone and can be printed. Their
community collects it without meeting a wallet, a seed phrase or a gas fee.

Built for NEAR HACKATHON. Tracks: `open`, `nfts`.

## The problem

A creator who wants verifiable collectible cards has to send their community through
wallets, gas fees and seed phrases, and most of that community stops there. Gachard
moves all of that behind an ordinary sign-in.

## How NEAR is used

| What | How | Where |
|---|---|---|
| Cards | NEP-245 multi tokens, one token id per card, supply 1 | [`gachard-cards/src/lib.rs`](gachard-cards/src/lib.rs) |
| Who released a card | The creator's own account signs `create_series` and `add_template` | same |
| No gas for users | NEP-366 meta transactions: the user signs, the platform pays gas and the 1 yocto deposit | [`frontend/lib/near.ts`](frontend/lib/near.ts) |
| No wallet | A named sub-account per user, created at sign-in | same |
| Platform cannot take a card | No method moves a card except the holder's own call | contract tests |
| Print and return | A printed card locks in place. Its code returns it to digital under the same token id | contract, `print_lock`, `redeem` |
| Public proof | Scan reads the contract live, and each history row links to NearBlocks | [`frontend/app/scan/[id]/page.tsx`](frontend/app/scan/[id]/page.tsx) |

## Try it

Needs Node 22.22 or later and internet access. You need no account, key or funds:
setup creates a throwaway testnet account from the public faucet, deploys the contract
from the committed wasm, and publishes a demo series with real transactions. Allow
about a minute.

```bash
cd frontend
npm install
npm run demo
```

Open http://localhost:3000, then:

1. **Sign in.** Click Sign in, then Continue with a demo account. You see 5,000 Credits and
   no wallet prompt.
2. **Open a pack.** Open Crystal Night: Starter Set, then Open a pack. You see five
   face-down cards and no price.
3. **See before paying.** Click Open all. You see each card and the pack's price, which is
   the sum of its cards' prices. Skip charges nothing.
4. **Buy.** Click Buy this pack. Credits fall by exactly that price and five cards are
   minted to your account.
5. **Verify.** Click See the first card's record. You see the holder, who released it, and
   whether the artwork file matches the hash on chain. Click check independently: NearBlocks
   shows the same transaction, outside this app.
6. **Print.** Click Print, read the simulation notice, then Lock and create PDF. The status
   reads Printed (hackathon demo PDF). Download the PDF: it holds the card, a QR code and
   the redeem code.
7. **Check the lock.** The send form is gone, because a printed card cannot move. The
   contract itself refuses it: the end-to-end check below proves that.
8. **Redeem as someone else.** Sign out, sign in with a new demo account and open
   `/scan/<token>` (the QR's address). Enter the code from the PDF. The same token id is now
   digital and yours, and its history shows the whole trip.
9. **Release your own.** Open Create, publish a series, and add a card for each rarity that
   has a rate. It goes live on the home page. A record of what your account published is on
   chain.

### Prove it without a browser

With the setup above done, this runs the whole path against testnet and fails if a user's
balance falls by a single yoctoNEAR, or if the platform can move a user's card.

```bash
cd near-e2e
npm install
node --env-file=../frontend/.env.local e2e.mjs
```

The last recorded run, with its transaction links, is in
[`near-e2e/last-run.json`](near-e2e/last-run.json).

To run the whole app path over HTTP against any running copy, local or hosted, including
a pack, a print, a PDF, a redeem and a creator upload:

```bash
cd near-e2e
node app-flow.mjs http://localhost:3000
```

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
  ship. It says so in its margin and on the card back, and Scan says so too. A PDF can be
  copied and its code is visible, so a printout proves a link to a token, not ownership.
  In production the code would sit under a scratch-off layer.
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
- **What was built for this hackathon is the diff from `pre-hackathon` to
  `hackathon-submission`.** That covers the contract, all NEAR integration, the new app and
  the end-to-end check. Solidity, `ethers`, Pyth and Privy were removed.
- Reused from the baseline: the visual tokens in `frontend/app/globals.css`,
  `frontend/lib/crypto.ts`, `frontend/components/Logo.tsx`, and the images in
  `frontend/public`.
- Libraries: `near-sdk`, `near-api-js`, Next.js, React, Tailwind, `pdf-lib`, `qrcode`, `mongodb`,
  `google-auth-library`, and `sharp` for the seed script only.
- Much of the code was written with an AI coding agent, Claude Code, under the author's
  direction.

Why each decision was made is in [`DECISIONS.md`](DECISIONS.md). ADR-041 to ADR-044 cover this
version. Older ADRs describe the Monad product.

## License

[MIT](LICENSE)
