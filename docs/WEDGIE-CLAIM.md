# Claim a wedgie with conviction — brief for the wedgie-dev session

Austin wants CLAWD stakers to burn 500,000,000 CV (clawdviction, larv.ai) for one free
wedgie, one per wallet, about 15 units total. **Build it on wedgie.dev, not on larv.ai.**
larv.ai already exposes the burn as an API meant for outside builders; wedgie.dev already
owns everything about a shipment (sealed address, stock, omen's label + ship flow, tracking
mail, the 30-day wipe, the privacy page). The claim is a third way to pay for an order.

Repos: this brief lives in `clawdviction/docs/WEDGIE-CLAIM.md` (github.com/clawdbotatg/clawdviction).
Site code to change: `clawdbotatg/wedgie-dev` (`api/order.ts`, `api/_shop.ts`, `src/pages/order.ts`),
and one guard in `clawdbotatg/wedgie-shipping` (`orders.py ship`).

## 1. What larv.ai gives you (already live, nothing to deploy there)

Base URL `https://larv.ai`. Both routes are CORS-open. Docs: https://larv.ai/skill.md.

**Balance (public, no auth)**

```
GET https://larv.ai/api/cv/balance?address=0x...
200 { "success": true, "balance": 618000000.0 }
404 { "success": false, "error": "wallet not found" }     // never staked
```

The balance is the DB column, materialized by a cron every 5 minutes, so it can lag live CV
by up to 5 minutes. `GET /api/clawdviction/0x...` returns the live figure (`clawdviction`
string, plus `accrualRate`) if you want to show a ticking number; the spend route checks the
5-minute column, so gate the button on `/api/cv/balance`.

**Spend (server-side only; the secret must never reach a browser)**

```
POST https://larv.ai/api/cv/spend
Content-Type: application/json
{
  "wallet":    "0x...",                 // the holder's address
  "signature": "0x...",                 // personal_sign (EIP-191) of exactly "larv.ai CV Spend"
  "secret":    "<CV_SPEND_SECRET>",     // shared secret, from larv.ai's Vercel env
  "amount":    500000000                // JSON number, positive integer
}
200 { "success": true, "newBalance": 118000000.0 }
400 missing fields / amount not a positive integer / malformed signature
402 { "success": false, "error": "insufficient balance", "balance": 42.0 }
403 { "success": false, "error": "invalid secret" }  or  "invalid signature"
404 { "success": false, "error": "wallet not found" }
503 database unavailable
```

Facts about this route (`clawdviction/packages/nextjs/app/api/cv/spend/route.ts`):

- The signature is verified on Base with viem `verifyMessage`, so EOAs **and** ERC-1271 smart
  wallets (Coinbase Smart Wallet etc.) work.
- The message is a fixed string, so one signature is replayable by anyone holding a spend secret.
  That is larv.ai's existing design for builders. Treat the signature like a bearer token:
  only ever post it to your own `/api/order`, never log it, don't store it.
- "Must hold ≥ 500M" and "burn 500M" are the same check: a wallet below 500M gets 402.
- larv.ai keeps **no per-spend ledger and no idempotency**. Two spends for the same wallet both go
  through. **One-per-wallet is wedgie.dev's job** (section 3).
- The deduction is not atomic with its balance check, which only matters if the same wallet fires
  two spends at once. The one-per-wallet reservation below makes that impossible for claims.

Who qualifies today (2026-10-26, from `/api/cv/leaderboard`): 21 wallets at ≥ 500M, the top one
at 15.7B. Austin wants to ship ~15, so the threshold is in the right place. More wallets cross
over time because CV keeps accruing.

## 2. Env for wedgie.dev's Vercel project

| Var | Value |
| --- | --- |
| `CV_SPEND_SECRET` | the same value as `CV_SPEND_SECRET` on the clawdviction Vercel project (BuidlGuidl DAO team). Austin copies it; it's set there and in clawdviction's local `.env.local`. |
| `CV_API` | `https://larv.ai` (default it in code; override to a stub for probes) |
| `CV_CLAIM_COST` | `500000000` |
| `CV_CLAIM_MAX` | `15` (claims ever, counted as `paid` + `shipped`) |

Like `STRIPE_SECRET_KEY` and `SHOP_PAY_TO`: no `CV_SPEND_SECRET` → the claim route says it isn't
open. Never send it to the browser, never log a request body (shop rule).

## 3. What to build on wedgie.dev

### The page

A page (suggest `/claim`; Austin's call) with the **same address form as /order** and the same
sealing. Reuse `shipTo()`, `ShipTo`, `seal()` from `src/pages/order.ts` / `src/shop/seal.ts`; the
cart is fixed to `{ wedgie: 1 }` (+ `abroad: true` when the country isn't US). Flow:

1. **Connect** a browser wallet. `order.ts` already does `eth().request({ method: "eth_requestAccounts" })`
   for USDC; `src/safe/rainbow.ts` hands back an EIP-1193 provider for WalletConnect wallets if you
   want phones to work. Lowercase the address everywhere.
2. **Show the balance** from `GET larv.ai/api/cv/balance?address=`. Below 500M: say how far off they
   are and link to larv.ai/stake. 404: "This wallet has never staked CLAWD."
3. **Address form** (unchanged fields: name, line1, line2, city, state/region, zip/postal, country,
   phone abroad, email). Email stays required: it's how the tracking mail reaches them.
4. **Sign**: `personal_sign` of the exact string `larv.ai CV Spend`. Say plainly on the button what
   happens: "Burn 500,000,000 CV for a wedgie. One per wallet. Can't be undone."
5. **Seal** `{ ...shipTo, cart }` exactly as `go()` does, then
   `POST /api/order { pay: "cv", cart, sealed, email, wallet, signature }`.
6. Land on `/order/<id>` like any order: it's `paid` from the start, so the page shows Paid and later
   Shipped / On the way / Delivered with no changes.

### The server: a `pay: "cv"` branch in `api/order.ts create()`

Order of operations matters. **Reserve first, burn second, mark paid third**, so a burn can never
happen without an order to ship, and a failed burn leaves nothing behind.

```
1. validate: cartOk + cart.wedgie === 1 && !cart.kit; sealed regex; email; wallet is 0x40hex;
   signature is 0x hex. Not open (no CV_SPEND_SECRET) → 503 like card/usdc.
2. verify the signature yourself too (viem is already a dep; use verifyMessage on a Base public
   client so ERC-1271 wallets pass). Cheap, and it stops a junk POST from holding a wallet's slot.
3. expireOld, tooMany(ip), short(cart, stockLeft) as today (claims take a real box).
   plus: count(*) from cv_claims where status in ('paid','shipped') >= CV_CLAIM_MAX → 409 "All the
   claim wedgies are gone."
4. reserve the wallet:  insert into cv_claims (wallet, order_id) values (…)  — primary key on wallet.
   Conflict → 409 "This wallet already claimed its wedgie." (Point at the existing order if you like:
   the row holds order_id.)
5. insert into orders (…, cents 0, pay 'cv', status 'new', payer = wallet, lines =
   [{item:'wedgie', qty:1, cents:0}]).  raced() as today; if raced, delete the cv_claims row too.
6. POST larv.ai/api/cv/spend with the secret, amount CV_CLAIM_COST.
   - 200 → update orders set status='paid', paid_at=now(); cv_claims.burned_at = now();
     return { id, token } → the page goes to /order/<id>.
   - 402 → delete the order row and the cv_claims row; return the balance in the message.
   - 403/404/other/network error → delete both rows; 502 "larv.ai didn't answer, nothing was burned."
     (If larv.ai answered 200 but your DB write then fails, that's the one bad state: log it to
     Telegram like pingPaid does, and keep the rows. Austin ships by hand from the ping.)
```

**Why a separate `cv_claims` table instead of a unique index on `orders.payer`:** `api/admin.ts`
wipes `payer` when an order ships (privacy), and shipped orders are deleted after 30 days. A claim
record must outlive both, or a wallet can claim again after its wedgie ships.

```sql
create table if not exists cv_claims (
  wallet text primary key,          -- lowercased
  order_id text not null,
  created timestamptz not null default now(),
  burned_at timestamptz);           -- null = reserved, larv.ai not yet asked (rows are deleted on failure)
```

A wallet is public data on larv.ai's leaderboard already, so keeping it is fine, but add one line to
`/privacy`: a claim keeps the claiming wallet address for good so the same wallet can't claim twice.

### Things that already work and should stay untouched

- `GET /api/admin` lists every `paid` order with `pay`, so omen sees it as `cv`. `label.py`, boxed,
  ship, the tracking timer, the paid/shipped mails, the 30-day wipe: all keyed on `status`, no change.
- `publicView`, `/order/<id>`, `remember(id, {token})`: unchanged. `cents: 0` and `usdc: null` mean
  the pay box has nothing to render, same as a paid card order.
- Stock: a claim takes one `wedgie` from `stock` like a paid order (`stockLeft` counts `paid` +
  `shipped`). Austin sets the stock on omen as usual.

### One guard in wedgie-shipping

`orders.py ship` calls `sweep([id])` after marking it shipped. Checked: for a `cv` order it derives
the deposit address from the salt, finds 0 USDC on all four chains and `continue`s, so it already
no-ops without error. It still spends 8 Alchemy calls per ship; skipping it when the listed order's
`pay == "cv"` is a nicety, not a fix. `orders.py list` prints `$0.00 by cv`, which is fine.

### Decisions for Austin (defaults chosen if nobody objects)

- **Abroad:** allow it, free (the +$20 abroad fee doesn't apply when nothing is paid). Postage abroad
  is $16–30, so he may want US-only; a one-line toggle either way.
- **Cap:** `CV_CLAIM_MAX=15`, counted separately from stock, so claims can't eat the whole paid stock
  and paid orders can't block the last claim.
- **Route name:** `/claim`. (His first words were "/wedgie" on larv.ai; on wedgie.dev that reads oddly.)

### The price is fixed (Austin, 2026-10-26)

500,000,000 CV, for good. No sliding scale. For scale: CLAWD ≈ $0.0000037 on 2026-10-26, so $1,000
buys ≈ 268M CLAWD, which earns ≈ 13.4M CV a day (CV accrues at staked ÷ 20 per day). Stake $1,000 for
≈ 37 days, unstake, keep the money, claim a wedgie. Austin holds 618M on clawdbotatg.eth today.

## 4. Test

- A probe like `tools/shopprobe.mjs`: run a tiny HTTP stub for larv.ai (`CV_API=http://127.0.0.1:…`)
  that answers `/api/cv/balance` and `/api/cv/spend`; drive the page with a fake `window.ethereum`
  that returns a fixed address and a fixed signature; assert: below-500M is refused before any POST,
  a second claim from the same wallet gets 409 and the stub sees exactly one spend, a 402 from the
  stub leaves no order row and no `cv_claims` row, a 200 leaves a `paid` order that `orders.py`
  (with `ORDERS_PY`) lists and can mark shipped.
- The only real wallet Austin controls that qualifies today is clawdbotatg.eth
  (`0x11ce532845ce0eacda41f72fdc1c88c335981442`, ≈618M). A live end-to-end test burns 500M of it
  for real and uses one of the 15. Fine as the first claim, just know it's not free.
- `node tools/loadprobe.mjs` before pushing `src/` (wedgie-dev rule).

## 5. Optional, on the larv.ai side (not needed to ship)

larv.ai keeps no record of what a spend was for. If Austin wants a list of claimers on larv.ai
independent of wedgie.dev's DB, the clawdviction session can add an optional `memo` field to
`/api/cv/spend` and a `cv_spends` ledger table, plus a `once: true` flag that refuses a second
spend with the same memo for a wallet. That's belt-and-braces; wedgie.dev's `cv_claims` is the
authority either way.
