# ClawdViction — Production Plan (100 Users)

## TL;DR

- **Everything on Vercel.** Frontend + API routes + Postgres database.
- No separate backend server. No Fly.io. No AWS.
- **Vercel Pro plan (~$20/mo)** includes Postgres (Neon) — replaces SQLite entirely.
- AI cost target: **~$60–170/month** at 100 active users with memory compression.

---

## Architecture

```
┌──────────────────────────────────────────────┐
│  Vercel (Next.js)                            │
│                                              │
│  Pages:                                      │
│    /           → landing                    │
│    /onboard    → interview flow (NEW)        │
│    /stake      → stake $CLAWD                │
│    /chat       → talk to your larva          │
│                                              │
│  API Routes:                                 │
│    /api/chat           → larva AI            │
│    /api/chat/history   → load messages       │
│    /api/clawdviction   → on-chain read       │
│    /api/larva/status   → always running      │
│    /api/onboard        → save interview      │
│    /api/compress       → memory compression  │
│                                              │
│  Database: Vercel Postgres (Neon)            │
│    - chat_messages                           │
│    - memory_snapshots                        │
│    - larva_seeds (interview answers)         │
└──────────────────┬───────────────────────────┘
                   │
         ┌─────────┴─────────┐
         ▼                   ▼
┌─────────────────┐  ┌──────────────────┐
│  Anthropic API  │  │  Base Mainnet    │
│  Haiku (chat)   │  │  getClawdviction │
│  Haiku (compress│  │  (direct read)   │
└─────────────────┘  └──────────────────┘
```

### Why this works

The Express backend (`packages/backend/`) only existed because SQLite needs a
persistent disk. Vercel Postgres gives us persistence without a server.

Every backend endpoint becomes a Next.js API route. The event indexer goes away
too — clawdviction score is read directly from the Base contract on each request
(already how `/api/clawdviction/[wallet]/route.ts` works).

---

## The Cost Problem

History grows with every message. Without compression, sending full conversation
history to Claude gets expensive fast:

| Scenario | Requests/day | Monthly cost |
|----------|-------------|--------------|
| 100 users, 5 msgs/day, ~20 msg history | 500 | **$60** |
| 100 users, 10 msgs/day, ~40 msg history | 1,000 | **$222** |
| 100 users, 20 msgs/day, ~80 msg history (no compression) | 2,000 | **$840** |
| 100 users, 20 msgs/day, compressed to ~2K tokens | 2,000 | **$168** |

**Memory compression is the key lever.** Instead of sending 80 raw messages on
every request, periodically summarize the conversation into a compact memory
snapshot (~500 tokens), then send: `[identity brief] + [snapshot] + [last 10 messages]`.

---

## The Real Anthropic Cost Problem

Before talking about 100 users — the main bill driver isn't ClawdViction.
It's **context window × expensive model × message frequency**.

A Sonnet 4.6 session at 164K tokens costs ~$0.49 in *input alone* per message.
An Opus 4.6 session at that same size costs ~$2.46 per message.
50 Opus messages/day in a long session = ~$125/day. Add sub-agents and you're at $200/day.

**The fix for your existing bill (separate from ClawdViction):**
- Start new sessions more often (`/new`) — don't let sessions hit 200K tokens
- Reserve Opus for genuinely complex tasks; use Sonnet for triage/chat
- Don't spawn sub-agents for simple work

**For ClawdViction — model selection matters:**

Tested both Haiku and Sonnet on multi-turn governance reasoning (10-message
conversation, then "vote on a 500K PR proposal"). Results:

- Haiku: synthesized 3 stated values correctly, gave structured reasoning, made
  a constructive counter-suggestion. Not falling apart.
- Sonnet: synthesized 2 values, slightly cleaner phrasing.

Haiku is legitimately capable for routine chat. The case for Sonnet is the
**onboarding interview** — a one-time, high-stakes event where the quality of
probing follow-up questions directly seeds all future memory. Spend more there.

### Model-per-task breakdown

| Task | Model | Why |
|------|-------|-----|
| Onboarding interview | **Sonnet** | One-time, seeds all future memory, quality matters |
| Regular larva chat | **Haiku** | Frequent, proven capable, 4x cheaper |
| Memory compression | **Haiku** | Batch summarization, simple task |
| Governance deliberation (future) | **Sonnet/Opus** | Complex cross-larva reasoning |

### Cost with compression + tiered models

| Scenario | Daily cost | Monthly |
|----------|-----------|---------|
| 100 users, 20 msgs/day, Haiku + compression | ~$4/day | **~$120** |
| 100 users, 20 msgs/day, Sonnet + compression | ~$21/day | **~$630** |
| 100 users, 20 msgs/day, Sonnet, NO compression | ~$60/day | **~$1,800** |
| 100 onboarding interviews (Sonnet, one-time) | ~$2 total | ~$2 |

Compression is what makes Haiku viable. Without it, history grows and even
Haiku gets expensive. **Build compression before launch.**

## Monthly Cost (100 active users)

| Item | Cost |
|------|------|
| Vercel Pro (includes Postgres + bandwidth) | $20 |
| Anthropic: Haiku chat + Sonnet interviews + compression | ~$120–150 |
| Alchemy RPC — Base reads (free tier) | $0 |
| **Total marginal cost of ClawdViction** | **~$140–170/month** |

~$1.50/user/month. Does not compound your existing OpenClaw bill.

---

## Database: Vercel Postgres

Replace SQLite with Vercel Postgres. Schema:

```sql
-- Chat history
CREATE TABLE chat_messages (
  id SERIAL PRIMARY KEY,
  wallet TEXT NOT NULL,
  role TEXT NOT NULL,           -- 'user' | 'assistant'
  content TEXT NOT NULL,
  compressed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_chat_wallet ON chat_messages(wallet, created_at);

-- Memory snapshots (compressed conversation summaries)
CREATE TABLE memory_snapshots (
  wallet TEXT PRIMARY KEY,
  snapshot TEXT NOT NULL,
  message_count INTEGER,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Onboarding interview answers + generated identity brief
CREATE TABLE larva_seeds (
  wallet TEXT PRIMARY KEY,
  answers JSONB NOT NULL,        -- [{question, answer}, ...]
  identity_brief TEXT,           -- AI-generated compact summary
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Connecting

```typescript
// packages/nextjs/lib/db.ts
import { sql } from '@vercel/postgres';
export { sql };

// Usage in any API route:
const { rows } = await sql`
  SELECT role, content FROM chat_messages
  WHERE wallet = ${wallet}
  ORDER BY created_at ASC
  LIMIT 100
`;
```

---

## Onboarding Interview (The Important Part)

Right now larvae start cold. The interview fixes this — a structured first-run
flow that seeds each larva's memory before the first conversation.

### Flow

1. New wallet connects → redirect to `/onboard`
2. Five questions, one at a time (no wall of forms)
3. On submit → `POST /api/onboard` → saves answers → generates identity brief
4. Brief stored in `larva_seeds.identity_brief`
5. Redirect to `/chat` — larva already knows who you are

### Interview Questions (v1)

```
1. What should we call you? (name/handle — optional)
2. What drew you to $CLAWD?
3. What's the most important thing this community should stand for?
4. What kinds of proposals would you automatically support?
5. What would make you automatically oppose something?
6. How much risk are you comfortable with?
   → [Conservative] [Balanced] [High-conviction]
7. Anything else your larva should know about you?
```

### Identity Brief Generation

After interview, one Haiku call (~$0.001) produces:

```
Identity Brief for 0x11ce...:
Name: Austin
Philosophy: Decentralization above all. Skeptical of anything concentrating power.
Auto YES: Open source tooling, public goods, builder infrastructure
Auto NO: KYC, governance capture by whales, opaque treasuries
Risk tolerance: High-conviction. Backs ambitious experiments.
Context: Long-time builder. Cares about the long game over short-term price.
```

This brief is prepended to every system prompt so the larva starts knowing
who you are — even on message #1.

### API Route

```typescript
// /api/onboard/route.ts
export async function POST(req: NextRequest) {
  const { wallet, answers } = await req.json();

  // Generate identity brief via Haiku
  const brief = await generateIdentityBrief(wallet, answers);

  await sql`
    INSERT INTO larva_seeds (wallet, answers, identity_brief, completed)
    VALUES (${wallet}, ${JSON.stringify(answers)}, ${brief}, true)
    ON CONFLICT (wallet) DO UPDATE
    SET answers = EXCLUDED.answers,
        identity_brief = EXCLUDED.identity_brief,
        completed = true
  `;

  return NextResponse.json({ ok: true });
}
```

---

## Memory Compression

### How It Works

```
Full history in DB (100 messages):
  [msg 1..90]  → compressed to "Memory Snapshot" (~500 tokens)
  [msg 91..100] → kept raw

What gets sent to Claude on each request:
  system: [base prompt] + [identity brief] + [memory snapshot]
  messages: [last 10 raw messages]
```

### Trigger

Auto-compress when a wallet hits 40 messages. Run as a background
call at the end of `/api/chat` (non-blocking, `await` dropped).

```typescript
// Fire-and-forget at end of /api/chat
if (messageCount > 0 && messageCount % 40 === 0) {
  compressMemory(wallet).catch(console.error);
}
```

### Compression Prompt

```
Summarize this conversation between an AI governance larva and its owner.
Produce a compact memory snapshot (under 500 tokens) capturing:
- Key facts about the owner (name, values, preferences, background)
- Important positions they've stated
- Governance stances they've expressed
- Open threads worth following up on

This replaces the raw history. Preserve everything needed to represent
this person accurately in governance decisions.

[messages 1..N]
```

---

## Build Order

### Phase 1 — Vercel-native backend (2–3 days)

- [ ] `npm i @vercel/postgres` in packages/nextjs
- [ ] Create `packages/nextjs/lib/db.ts` — Postgres client
- [ ] Run schema migrations (SQL above) via Vercel Postgres dashboard or `vercel-postgres` CLI
- [ ] Port `/api/chat/route.ts` — load history from Postgres, save messages to Postgres
- [ ] Add `GET /api/chat/history/[wallet]/route.ts` — load conversation from Postgres
- [ ] Remove BACKEND_URL dependency from frontend (all routes are now local `/api/*`)
- [ ] Set `POSTGRES_URL` env var on Vercel (auto-set when you link a Postgres DB)
- [ ] Remove `packages/backend/` from Vercel build (or keep for local dev only)
- [ ] Fix deployment protection (toggle off in Vercel project settings)
- [ ] Smoke test on live Vercel URL

### Phase 2 — Onboarding Interview (2–3 days)

- [ ] Build `/onboard` page — multi-step interview UI
- [ ] `POST /api/onboard/route.ts` — save answers + generate brief
- [ ] Inject identity brief into larva system prompt
- [ ] Redirect new wallets to `/onboard` before `/chat`
- [ ] Allow re-taking the interview (update, not replace)

### Phase 3 — Memory Compression (1–2 days)

- [ ] Add `memory_snapshots` table to Postgres
- [ ] `POST /api/compress/[wallet]/route.ts` — run compression job
- [ ] Auto-trigger at 40 messages (fire-and-forget from `/api/chat`)
- [ ] Update `/api/chat` to use `[snapshot] + [last 10]` instead of full history
- [ ] Test: verify larva recalls compressed info correctly

### Phase 4 — Rate Limiting + Monitoring (1 day)

- [ ] Vercel KV (Upstash) for per-wallet daily message counts
- [ ] Return 429 with friendly message when limit hit
- [ ] Simple `/admin` page (wallet-gated): active users, messages/day, est. monthly cost
- [ ] Log token counts per request to Postgres for cost tracking

---

## Local Dev

Keep `packages/backend/` for local development (SQLite, no DB setup required).
Use `NEXT_PUBLIC_BACKEND_URL=http://localhost:3001` in `.env.local`.

In production, `NEXT_PUBLIC_BACKEND_URL` is unset → frontend uses Next.js API
routes → Vercel Postgres.

No code changes needed in the frontend — the routing is already in place.

---

## What This Doesn't Cover Yet

- **Governance deliberation:** When a proposal drops, larvae debate it before
  presenting a recommendation. Sonnet-level work — budget per-proposal separately.

- **Cross-larva consensus:** Aggregating stances across 100 larvae into a
  community position. Needs a coordinator layer.

- **Larva portability:** ERC-6551 token-bound accounts so the larva travels
  with your NFT across apps. Pairs with `clawd-6551`.

- **Staking-weighted votes:** Larva opinions weighted by clawdviction score,
  not 1-per-wallet.
