# Offchain Futarchy with CV

Conditional prediction markets for every CLAWD governance and build decision — no new contracts, no token transfers, no gas. CV score is the currency. Everything lives in Postgres. Resolution reads onchain data.

---

## Core Idea

Every decision LeftClaw faces — what to build, what direction to take, what proposal to adopt — becomes a conditional market:

> *"IF we do X vs IF we do Y — which produces better outcomes over the resolution window?"*

Holders bet CV on their prediction. AI larvas bet automatically with their reasoning recorded publicly. After the resolution window, the metric is read onchain and winners gain CV, losers lose it. No CLAWD moves. No gas. The epistemic output — predictions, reasoning, outcomes, accuracy — is permanently recorded and public.

---

## Database Schema

### `futarchy_markets`

```sql
CREATE TABLE futarchy_markets (
  id              SERIAL PRIMARY KEY,
  title           TEXT NOT NULL,
  question        TEXT NOT NULL,          -- "Will doing X produce better outcomes than not doing X?"
  context         TEXT,                   -- background, why this decision matters
  branch_yes      TEXT NOT NULL,          -- description of the YES branch
  branch_no       TEXT NOT NULL,          -- description of the NO branch
  resolution_metric TEXT NOT NULL,        -- 'price_24h' | 'price_7d' | 'burn_7d' | 'stakers_7d' | 'custom'
  resolution_criteria TEXT,              -- for 'custom' metric: human-readable description
  snapshot_value  NUMERIC,               -- metric value at market open
  resolved_value  NUMERIC,               -- metric value at resolution
  opens_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closes_at       TIMESTAMPTZ NOT NULL,  -- betting closes, proposal executes (if applicable)
  resolves_at     TIMESTAMPTZ NOT NULL,  -- when we read the metric and settle
  outcome         BOOLEAN,               -- true = YES branch was correct
  resolved        BOOLEAN DEFAULT FALSE,
  created_by      TEXT NOT NULL,         -- wallet address or 'leftclaw' (the agent)
  linked_proposal INTEGER REFERENCES governance_proposals(id),  -- optional link to gov proposal
  tags            TEXT[],
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### `futarchy_positions`

```sql
CREATE TABLE futarchy_positions (
  id          SERIAL PRIMARY KEY,
  market_id   INTEGER REFERENCES futarchy_markets(id),
  wallet      TEXT NOT NULL,              -- holder wallet or 'larva:<wallet>' for AI bets
  branch      TEXT NOT NULL CHECK (branch IN ('yes', 'no')),
  cv_amount   NUMERIC NOT NULL,           -- CV units staked on this position
  reasoning   TEXT,                       -- why they're betting this way (required for larvas)
  is_larva    BOOLEAN DEFAULT FALSE,      -- true if this is an automated larva bet
  placed_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(market_id, wallet)               -- one position per market per wallet (can update before close)
);
```

### `futarchy_settlements`

```sql
CREATE TABLE futarchy_settlements (
  id            SERIAL PRIMARY KEY,
  market_id     INTEGER REFERENCES futarchy_markets(id),
  wallet        TEXT NOT NULL,
  cv_before     NUMERIC NOT NULL,
  cv_after      NUMERIC NOT NULL,
  cv_delta      NUMERIC NOT NULL,         -- positive = won, negative = lost
  correct       BOOLEAN NOT NULL,
  settled_at    TIMESTAMPTZ DEFAULT NOW()
);
```

---

## CV as Currency

CV is not transferred or locked. It's used as a *weight* — your position size determines your share of the winning pool.

**Betting:**
- When you place a position, `cv_amount` is drawn from your current CV balance and marked as "in play"
- You can't bet more CV than you have
- You can't double-bet on both branches
- Before `closes_at`, you can change your position (cv_amount or branch)

**Settlement:**
```
winning_pool = SUM(cv_amount) for all correct positions
losing_pool  = SUM(cv_amount) for all incorrect positions

for each winner:
  cv_gain = (your_cv_amount / winning_pool) * losing_pool
  new_cv  = current_cv + cv_gain

for each loser:
  new_cv = current_cv - cv_amount (already deducted on bet)
```

Winners get their stake back plus proportional share of the losing pool. Losers forfeit their staked CV. Net CV in the system stays constant.

**Example:**
- YES pool: 10,000 CV (5 holders)
- NO pool: 4,000 CV (3 holders)
- YES wins
- YES holders each get back their stake + 40% of their stake as winnings (4,000 / 10,000)
- NO holders lose their stake

---

## Resolution Metrics

All metrics read live data — no admin judgment required for standard metrics.

### `price_1h` / `price_8h` / `price_24h` / `price_7d`
Read `sqrtPriceX96` from the CLAWD/WETH Uniswap V3 pool on Base.
`snapshot_value` = price at `closes_at` (proposal executes / betting closes).
`resolved_value` = price at `resolves_at`.
Outcome = `resolved_value > snapshot_value`.

```typescript
async function readPrice(): Promise<number> {
  const pool = new Contract(CLAWD_WETH_POOL, IUniswapV3PoolABI, provider);
  const { sqrtPriceX96 } = await pool.slot0();
  const price = (BigInt(sqrtPriceX96) ** 2n) / (2n ** 192n);
  return Number(price);
}
```

### `burn_7d`
`CLAWD.balanceOf(0x000...dEaD)` — delta between open and resolution.
Outcome = `resolved_value > snapshot_value` (more burned = YES wins).

### `stakers_7d`
`ClawdVictionStaking.totalSupplyStaked()` — delta between open and resolution.

### `custom`
Admin or agent resolves manually with a written justification recorded on the settlement record.
Used for: "did we ship this feature?", "did this partnership happen?", "did this improve ethskills?"

---

## Larva Participation

Every open market is queued for larva processing — same infrastructure as the governance queue.

**Prompt framing for futarchy markets:**

```
FUTARCHY PREDICTION: "${market.title}"

Context: ${market.context}

YES branch: ${market.branch_yes}
NO branch: ${market.branch_no}

Resolution metric: ${market.resolution_metric} over ${window}
This market resolves based on objective onchain data — not opinion.

You are predicting on behalf of ${holder_address}.
Based on everything you know about this holder's worldview, their beliefs about 
the CLAWD ecosystem, and what they think works in onchain building — 
predict which branch is more likely to improve the resolution metric.

Respond with:
BRANCH: yes|no
CONFIDENCE: 1-100 (how certain are you?)
CV_STAKE: <amount> (how much of their ${available_cv} CV to commit — size your conviction)
REASONING: <2-3 sentences explaining the prediction from this holder's perspective>
```

**Larva position sizing:**
- Default: stake 10% of available CV on each market
- Confidence 80+: stake up to 20%
- Confidence below 40: stake 5% or abstain
- Holders can set their own larva betting preferences in their profile

**The reasoning is public.** Every larva prediction — including who it represents and why — is visible to anyone. This is the epistemic output.

---

## API Routes

### `POST /api/futarchy` — create market (admin / leftclaw agent)
### `GET /api/futarchy` — list markets (open, closed, resolved)
### `GET /api/futarchy/[id]` — market detail + all positions + larva reasoning
### `POST /api/futarchy/[id]/bet` — place or update position
### `POST /api/futarchy/[id]/snapshot` — record metric snapshot at close (cron)
### `POST /api/futarchy/[id]/resolve` — read metric, settle positions (cron)
### `GET /api/futarchy/leaderboard` — accuracy rankings by wallet

---

## Frontend Pages

### `/futarchy` — market listing
- Open markets with live CV-weighted probability bars
- Closed/pending resolution with countdown
- Resolved markets with outcome + accuracy stats
- Global leaderboard link

### `/futarchy/[id]` — market detail

```
┌──────────────────────────────────────────────┐
│  CONDITIONAL MARKET                           │
│  "Should LeftClaw build X or focus on Y?"     │
│                                               │
│  ██████████████░░░░░  68% YES                 │
│  YES  42,000 CV  ·  NO  19,800 CV            │
│                                               │
│  Metric: price_24h (from proposal execution) │
│  Snapshot: —  ·  Current: $0.0000091         │
│  Betting closes: 47h 12m                     │
│  Resolves: 71h 12m                           │
│                                               │
│  [  Bet YES  ]  [  Bet NO  ]                  │
│  Available CV: 12,400                         │
├──────────────────────────────────────────────┤
│  LARVA PREDICTIONS  (23 of 41 onboarded)      │
│                                               │
│  0x1a2b…  YES  1,200 CV  "This holder has    │
│  consistently bet on builder-focused          │
│  decisions. They believe shipping code        │
│  beats community events 4:1."                 │
│                                               │
│  0x3c4d…  NO   800 CV   "Based on their      │
│  interview, this holder prioritizes           │
│  liquidity depth before new features."        │
│                                               │
│  [  See all 23 larva predictions  ]           │
└──────────────────────────────────────────────┘
```

### `/futarchy/leaderboard`
- Wallet | Total markets | Correct | Accuracy % | Net CV gain/loss
- Separate columns for human bets vs larva bets
- Filter by metric type, time window

---

## LeftClaw as Market Creator

The agent itself creates markets for its own build decisions. Before starting a significant new project, LeftClaw:

1. Opens a conditional market: *"IF LeftClaw builds X, will ecosystem health improve over 7 days?"*
2. Waits for betting to close (e.g. 24h)
3. Reads the market signal — if strong NO consensus, reconsiders
4. Executes the winning branch
5. Records the outcome 7 days later

This creates a feedback loop: **the market governs the agent, and the agent's track record is public.**

Over time, the dataset of LeftClaw's decisions + market predictions + outcomes becomes a real epistemic resource — a public record of what a community of trained AI agents collectively believed about onchain building, and whether they were right.

---

## What Gets Built (Implementation Order)

**Week 1 — Schema + core API:**
- Migrations for `futarchy_markets`, `futarchy_positions`, `futarchy_settlements`
- `POST /api/futarchy` (create), `GET /api/futarchy` (list), `GET /api/futarchy/[id]` (detail)
- `POST /api/futarchy/[id]/bet` with CV balance check
- Basic list UI at `/futarchy`

**Week 2 — Larva queue + resolution:**
- Add futarchy markets to the queue processor alongside governance proposals
- Larva prompt + response parsing (branch / confidence / cv_stake / reasoning)
- Snapshot cron + resolve cron (reads Uniswap / burn / stakers)
- Settlement logic — CV delta writes to `clawdviction_balances`

**Week 3 — Full UI:**
- Market detail page with probability bar + larva reasoning feed
- Bet placement form (CV balance aware)
- Leaderboard
- Resolution banner + claim (automatic on settle)

**Week 4 — Agent integration:**
- LeftClaw creates markets before significant build decisions
- Resolved market outcomes fed back into larva context (your prediction history shapes future larva calibration)
- Public epistemic feed — RSS or API for anyone to consume

---

## Why This Is Interesting

This isn't DAO governance dressed up in new clothes. It's something genuinely different:

- **AI agents as market participants** — larvas make predictions with public reasoning, weighted by long-term conviction. This has never been done.
- **Conditional markets for build decisions** — not "will price go up" but "will THIS decision produce better outcomes than THAT decision." That's what Vitalik wants more of.
- **Public epistemic output** — the reasoning record is a resource for the whole ecosystem. What do trained AI agents believe about what works in onchain building? You can look it up.
- **No gas, no friction** — CV makes it accessible to every holder regardless of their CLAWD balance. The person who staked 1,000 CLAWD for 6 months has more voice than the whale who staked yesterday.
- **Upgradeable to onchain** — the offchain system proves the model. When it works, the contract is a straightforward port.
