# Incident Runbook v2: a key is suspected stolen

*Written 15 October 2026 for the v2 contracts (ADR-040,
`docs/CONTRACT-V2-SPEC.md`). It applies once v2 is deployed. Until then
`docs/INCIDENT-RUNBOOK.md` is the one in force. v1 stays alive for as long as
printed v1 cards are unredeemed, so keep both.*

Read section 1 and act. The reasons come after.

---

## 1. Do this first: pause

**Who**: the Guardian, the separate account on the hardware wallet. Not the
Safe, and not a server.

**What**: `pause()` on all three contracts, plus `retire()` on
`MigrationMinter` if it is still active.

**How**: on MonadVision, open each contract → Contract → Write Contract →
Connect Wallet with the Guardian account → `pause`. This is the route that
worked in the v1 drill. Verify each call on the device's own screen.

With cast instead, closing any browser wallet and Ledger Live first:

```bash
G="m/44'/60'/1'/0/0"   # the Guardian's Ledger account, if it is account 1
RPC=https://testnet-rpc.monad.xyz
cast send $V2_CARDS  "pause()" --ledger --mnemonic-derivation-path "$G" --rpc-url $RPC
cast send $V2_STORE  "pause()" --ledger --mnemonic-derivation-path "$G" --rpc-url $RPC
cast send $V2_ALBUMS "pause()" --ledger --mnemonic-derivation-path "$G" --rpc-url $RPC
```

**What the pause stops**: every privileged path.
- minting and purchases;
- Relayer-submitted transfers, burns, prints and redeems;
- album placement, Wish Cards and rewards.

**What it does not stop**: a holder moving their own Digital card. That is
deliberate (decision D2): a self-custody user's card is never frozen by
Gachard. Section 5 covers what that means when custodial keys leak.

**Unlike v1, there is no race to lose.** Pausing cannot be undone by the
attacker, because only the Safe unpauses. A stolen Relayer key cannot move or
burn anyone's card anyway, since every such action needs the holder's
signature. The pause is there to stop everything while you find out which key
it was.

**Pause first, investigate afterwards.** The same asymmetry as v1 applies: a
pause on a false alarm costs minutes, and the Safe undoes it.

---

## 2. Which key, and what to do about it

| Stolen | What the attacker can do | Do this |
|---|---|---|
| **One Relayer key** | Mint tokens up to that key's hourly limit, which Gachard never admits (ADR-036). Spend entropy fees. Commit or reveal rotations. **Not**: move, burn, print or redeem anyone's card | Guardian: `emergencyRevoke(RELAYER_ROLE, key)` on GachardCards and `emergencyRevokeRelayer(key)` on Store and Albums. The second Relayer carries traffic once the Safe unpauses. The Safe grants a replacement through the timelock (48 h) |
| **Relayer key plus the database and `ENCRYPTION_SECRET_KEY`** | Sign as any custodial holder, so custodial cards can be moved or burned, within the hourly limits while unpaused, and **moved directly by the holder address even while paused** (section 5) | Pause. Guardian lowers every limit to 0 with `lowerLimit`, then revokes both Relayers. Rotate the whole environment. Recovery is replacement, not return (section 5) |
| **The Guardian key** | Pause, lower limits, revoke Relayers: downtime, never theft. It cannot propose or execute admin actions | Safe unpauses. Safe queues revoking the old Guardian and granting a new one. During those 48 h the attacker can keep pausing, so expect downtime, and keep unpausing |
| **One Safe key** | Nothing alone: the Safe is 2-of-3 | Replace that signer in the Safe with the other two keys. A Safe owner change is a Safe transaction, not a timelock one, so it is immediate |
| **Two Safe keys** | Queue any admin action. It takes 48 h to execute, and every queued action raises an alert. They can also unpause, so a pause no longer holds | Guardian: `cancel(operationId)` on the timelock for every queued action. Guardian cancelling was added for exactly this case. Admin is then frozen but not hostile: contracts keep running. Read ADR-040 before anything else |
| **The deployer key** | Nothing. It holds no role after handover, and `CheckV2` proves it | Nothing to do. Confirm with `CheckV2` |
| **The attestor key** (before mainnet: KMS) | Nothing alone: it only co-signs what a Relayer submits | Safe queues `setAttestor(new)` on Store and Albums |

**Every role change ends with `CheckV2`**:

```bash
cd contracts
FOUNDRY_PROFILE=v2 forge script script/v2/CheckV2.s.sol --rpc-url https://testnet-rpc.monad.xyz
```

It fails on any stray admin, Relayer or minter, and on any role still held by
the deployer or the v1 admin.

---

## 3. How you would know

From the monitoring planned in spec §15, which is not built yet:
- **A timelock proposal you did not make.** Every proposal alerts all signers.
- **A role granted or revoked** that nobody announced.
- **A pause** nobody announced.
- **Limits at 60% or 90%** outside the usual hours.
- **The supply check**: tokens above the highest id Gachard acknowledges
  (ADR-036).
- **Burns or exports well above the usual rate**, or listings far below fair
  value.
- **A rotation reveal overdue** (`rotationOverdue`).
- **Relayer gas or the entropy balance** draining faster than traffic explains.

---

## 4. Getting back to working

1. **Revoke before you unpause.** Unpausing with the stolen key still in place
   reopens the door.
2. **Rotate the whole environment, not only the key.** If the attacker reached
   Vercel, everything in it is gone: `MONGODB_URL`, `ENCRYPTION_SECRET_KEY`,
   `PRIVY_APP_SECRET`, `ADMIN_PASSWORD`, every Relayer key. Replacing one of
   them is not recovery.
3. **The Safe unpauses** (`unpause()` from the Safe, 2-of-3, no timelock).
4. **The Safe queues the replacement Relayer grant.** The second Relayer runs
   the platform for the 48 hours.
5. **Settle what was in flight.** Check the admin console's Stuck in flight
   list, so nobody is left with Credits or Crystal spent and no card.
6. **Run `CheckV2`.**

---

## 5. What this cannot protect

**Custodial cards, once the custodial keys leak.** Those keys are Gachard's,
held encrypted in MongoDB (ADR-020). Whoever has them plus
`ENCRYPTION_SECRET_KEY` is the holder in every sense the contract knows.
- **They can sign holder actions.** The limits and the pause bound those.
- **They can call `safeTransferFrom` directly from the custodial addresses**,
  paying their own gas, and the pause does not stop that. That is the price of
  D2: no Gachard key can freeze a holder's own transfer, so none can freeze a
  thief holding a custodial key either. The real fix is D5, custodial keys in a
  KMS where they cannot be copied, and it is required before mainnet.
- **What limits the damage**: a stolen card is never admitted back into
  Gachard, because every action starts from the database (ADR-036). Outside
  Gachard it has no name or image (ADR-033). The thief holds a token with
  nowhere to sell it.
- **Recovery is replacement, not return.** The ledger has no forced transfer, by
  design. Standard cards can be re-minted to their owners from the
  pre-incident snapshot (ADR-036), through a module granted by the timelock.
  **Limited cards cannot be replaced past `maxSupply`.** Say so to affected
  users plainly.

**Self-custody cards are now protected.** No Gachard key can move or burn them:
- transfers and burns need the holder's signature;
- the pause never blocks the holder;
- the ledger has no admin transfer.

That closes the gap that the v1 runbook's section 5 left open.

---

## 6. Drill

Run on testnet after deploy, and again after any key change. None of it moves
a card.

1. **Pause and unpause.** The Guardian pauses all three contracts, and the Safe
   unpauses. This proves the Guardian's device signs on this network and the
   Safe can act without the timelock.
2. **Revoke and re-grant.** The Guardian revokes Relayer 1, and traffic
   continues on Relayer 2. The Safe queues re-granting Relayer 1, waits
   48 hours, then executes.
3. **Cancel.** The Safe queues a harmless action (`setURI("")`), and the
   Guardian cancels it. This proves the stolen-Safe defence works.
4. **`CheckV2`** after each step.

Write down what broke. The v1 drill found a missing PATH entry and a Ledger
connection held by a browser wallet, and both are now in the v1 runbook.
