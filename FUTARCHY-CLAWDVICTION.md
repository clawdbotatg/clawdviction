# Futarchy Inside ClawdViction

How to extend the existing ClawdViction system into a futarchy governance platform — without a new contract, without new token flows, and without breaking anything that already works.

---

## The Insight

ClawdViction already has every component futarchy needs:

| Futarchy needs | ClawdViction already has |
|---|---|
| Skin in the game | CLAWD staked in `ClawdVictionStaking.sol` |
| Weighted voting power | CV score (`amount × seconds staked`) |
| Participants who form beliefs | AI larvas trained on holder values |
| A yes/no signal per participant | `governance_responses` table |
| A price oracle | `fetchPriceFromUniswap.ts` |

The existing governance vote **is already a prediction market** — it's just not tracking whether the predictions were correct. Futarchy is the layer that closes that loop.

---

## What Changes

### 1. Proposals gain a resolution spec

Add three fields to `governance_proposals`:

```sql
ALTER TABLE governance_proposals
  ADD COLUMN resolution_metric TEXT,      -- 'price_24h' | 'burn_7d' | 'stakers_7d'
  ADD COLUMN resolution_window_hours INT, -- e.g. 24
  ADD COLUMN snapshot_value NUMERIC,      -- metric value when proposal opens
  ADD COLUMN resolved_value NUMERIC,      -- metric value at resolution
  ADD COLUMN resolved_at TIMESTAMPTZ,
  ADD COLUMN futarchy_outcome BOOLEAN;    -- true = YES won (metric improved)
```

When admin creates a proposal, they optionally set `resolution_metric` and `resolution_window_hours`. If set, the proposal becomes a futarchy proposal. Existing proposals without these fields behave exactly as before.

### 2. The vote UI shows market odds

The `/gov/[id]` page already shows response counts. Extend it to show:

- **Implied probability** — CV-weighted YES% vs NO% from existing responses
- **Your larva's position** — what it bet and why
- **Resolution metric** — what we're measuring and when
- **Live metric value** — current price / burn / stakers vs snapshot

This is entirely frontend + API work — no contract changes.

```typescript
// In /api/gov/[id]/route.ts — add to the response:
const tallyResult = await sql`
  SELECT
    SUM(CASE WHEN COALESCE(human_override, response) = 'yes' THEN cb.balance ELSE 0 END) as yes_cv,
    SUM(CASE WHEN COALESCE(human_override, response) = 'no'  THEN cb.balance ELSE 0 END) as no_cv
  FROM governance_responses gr
  LEFT JOIN clawdviction_balances cb ON gr.wallet = cb.wallet
  WHERE gr.proposal_id = ${id}`;

const yesCV  = parseFloat(tallyResult.rows[0].yes_cv || '0');
const noCV   = parseFloat(tallyResult.rows[0].no_cv  || '0');
const totalCV = yesCV + noCV;
const impliedProbability = totalCV > 0 ? yesCV / totalCV : 0.5;
```

### 3. Resolution endpoint

A new API route: `POST /api/gov/[id]/resolve`

Admin-only for Phase 1. Reads the resolution metric, compares against snapshot, records the outcome.

```typescript
// POST /api/gov/[id]/resolve
const metric = proposal.resolution_metric; // 'price_24h'
const currentValue = await readMetric(metric); // fetchPriceFromUniswap or burn/stakers read

const outcome = currentValue > proposal.snapshot_value; // true = YES won

await sql`
  UPDATE governance_proposals SET
    resolved_value = ${currentValue},
    resolved_at    = NOW(),
    futarchy_outcome = ${outcome}
  WHERE id = ${id}`;
```

`readMetric` for price reuses the existing `fetchPriceFromUniswap.ts`. For burn: `balanceOf(0xdead)`. For stakers: `totalSupplyStaked` from the contract.

### 4. CV adjustment on resolution

When a proposal resolves, holders who voted correctly earn a CV multiplier. Wrong voters earn nothing extra (their actual staked CLAWD is never touched — only their governance weight is affected).

```sql
-- Add to governance_responses
ALTER TABLE governance_responses
  ADD COLUMN futarchy_correct BOOLEAN,
  ADD COLUMN cv_bonus NUMERIC DEFAULT 0;
```

```typescript
// After resolve: mark who was right, apply bonus to clawdviction_balances
const correctVote = outcome ? 'yes' : 'no';

await sql`
  UPDATE governance_responses SET
    futarchy_correct = (COALESCE(human_override, response) = ${correctVote})
  WHERE proposal_id = ${id}`;

// Give CV bonus to correct voters proportional to their existing CV
await sql`
  UPDATE clawdviction_balances cb SET
    balance = balance * 1.05   -- 5% CV bonus for correct prediction
  FROM governance_responses gr
  WHERE gr.proposal_id = ${id}
    AND LOWER(gr.wallet) = LOWER(cb.wallet)
    AND gr.futarchy_correct = true`;
```

The bonus percentage is configurable. No CLAWD moves. No contract interaction. Pure offchain governance weight adjustment.

### 5. Larva framing update

In `processQueueItem.ts`, futarchy proposals get a different prompt framing:

```typescript
const userMessage = isFutarchy
  ? `FUTARCHY PREDICTION: "${item.title}"

Question: ${item.question}
Resolution metric: ${item.resolution_metric} over ${item.resolution_window_hours}h

This is not a preference vote — it's a prediction. Based on everything you know about this holder's worldview and beliefs about the protocol, predict whether this proposal will IMPROVE the resolution metric or NOT.

Respond with ONLY "yes" (will improve) or "no" (will not improve) on the first line, then explain your reasoning — specifically: what evidence or beliefs lead you to this prediction?`
  : existingVotePrompt;
```

This is a meaningful change. The larva is no longer asking "what does my holder want?" — it's asking "what does my holder *believe will happen*?" That distinction trains holders to think in predictions, not preferences.

---

## What the UI Looks Like

### Proposal card on `/gov`

Futarchy proposals get a `FUTARCHY` badge alongside `VOTE` / `RFC`. Shows implied probability (e.g. "67% YES") live from CV-weighted responses.

### Proposal detail on `/gov/[id]`

```
┌─────────────────────────────────────────┐
│  FUTARCHY  •  Should we ship X?         │
│                                         │
│  ████████████░░░░░  67% YES             │
│  YES  1.2M CV  ·  NO  580K CV           │
│                                         │
│  Resolution: price_24h                  │
│  Snapshot: $0.0000082                   │
│  Current:  $0.0000091  ↑ +10.9%         │
│  Resolves: 18h 42m                      │
│                                         │
│  Your larva voted: YES                  │
│  "Based on recent burn trends..."       │
└─────────────────────────────────────────┘
```

After resolution:
```
┌─────────────────────────────────────────┐
│  ✅ RESOLVED — YES WON                  │
│  Price at close: $0.0000091 (+10.9%)    │
│  Your larva was CORRECT                 │
│  CV bonus applied: +5%                  │
└─────────────────────────────────────────┘
```

### Leaderboard: `/gov/leaderboard`

Track prediction accuracy over time. Wallets with the best track record rise in governance weight. Wallets that consistently predict wrong have lower effective influence. This emerges naturally from CV adjustments — no extra code needed.

---

## Rollout Plan

**Week 1:** Schema migrations + resolution endpoint + price snapshot on proposal creation. No UI changes yet. Run one real proposal internally to test resolution flow.

**Week 2:** UI updates to `/gov/[id]` — implied probability bar, live metric display, resolution banner. Larva prompt update for futarchy framing.

**Week 3:** First public futarchy proposal. Let the community bet with their conviction. Resolve it. Show who was right.

**Week 4+:** CV bonus system live. Leaderboard. Iterate based on what the market actually did.

---

## What This Is

This is not a separate system. It's ClawdViction completing its own loop:

- Stake CLAWD → earn CV → your larva forms beliefs → beliefs become predictions → predictions resolve against reality → accuracy shapes future governance weight

Every holder who is right about the protocol gains more influence over time. Every holder who is wrong, loses it — gradually, fairly, and automatically.

That's futarchy inside ClawdViction.
