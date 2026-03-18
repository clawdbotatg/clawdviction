# ClawdViction — Dev Context

## What it is
- Frontend: Next.js app at `/Users/clawd/clawd/clawdviction/packages/nextjs`
- Staking contract: **live on Base mainnet** at `0xAF206d40F293f5892ce86986BaFF5BB426a188a1`
- Real $CLAWD token: `0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07`
- Dev server runs locally at `http://localhost:3000`
- **No Express backend in use** — all API routes go through Next.js → Neon Postgres

## Database
- **Neon Postgres** — env vars in `packages/nextjs/.env.local`
- Tables: `larva_seeds` (onboarding), `chat_messages`, `memory_snapshots`
- ⚠️ Wallet addresses stored **mixed-case (checksummed)** — never use `lower()` when querying
- `larva_seeds.identity_brief` column exists but is now always NULL — raw answers used instead

## Architecture
- ClawdViction score read directly from contract via Next.js API (`/api/clawdviction/[wallet]`)
- Onboarding answers → Neon via `/api/onboard/[wallet]`
- Chat history → Neon via `/api/chat/history/[wallet]`
- AI chat → Anthropic (Haiku) called directly from Next.js API
- Auto-greeting on first chat: `/api/chat/greet` — reads raw onboarding Q&A, generates personalized hello

## Auth (wallet signature)
- `hooks/useAuth.ts` — signs message on first visit, stores in localStorage for 1 week
- `lib/authFetch.ts` — wraps fetch with auth headers (message is **base64-encoded** to avoid \n in headers)
- `lib/verifyAuth.ts` — server-side: decodes base64 message, verifies sig with viem, returns lowercase address
- **Only required on /chat** — stake/about/home are fully public
- Protected routes: `/api/chat`, `/api/chat/greet`, `/api/chat/history/[wallet]`, `/api/onboard/[wallet]`, `/api/larva/[wallet]/launch`
- Public routes: `/api/clawdviction/[wallet]`, `/api/larva/[wallet]/status`

## Onboarding → Larva Memory (IMPORTANT)
- **No summarization** — raw Q&A injected directly into system prompt
- `lib/questions.ts` — shared file: exports `QUESTIONS` array + `formatAnswersAsQA()` helper
- `formatAnswersAsQA()` formats answers with full question prompts + labeled answers → multi-section string
- Onboard POST: saves raw `answers` JSONB to DB, sets `completed = true`, NO LLM call
- Chat + Greet routes: fetch `answers` from DB, call `formatAnswersAsQA()`, inject into system prompt
- localStorage cache key: `clawdviction-onboarded-${address}` = "true" (was `clawdviction-brief-${address}`)
- `identityBrief` state removed from chat page — server owns the Q&A context entirely

## Character Limits (onboarding)
- Main textarea answers: **500 chars** (`MAX_LENGTH_MAIN`)
- Sub-prompt notes (checklist "anything else" / scale "why that number"): **300 chars** (`MAX_LENGTH_NOTES`)
- Constants defined in `lib/questions.ts`
- `CharCounter` component inline in `OnboardingInterview.tsx`: shows `X / max`, warning at 85%, error at 100%
- Hard-enforced via HTML `maxLength` attribute

## Key UX flows
- **Nav:** Home → Stake → Chat → About
- **Chat page** is the single entry point:
  1. Not connected → connect wallet prompt
  2. Wallet reconnecting → spinner
  3. Not signed → "Connect to $CLAWD Larvae" sign-in screen
  4. All data loading → spinner (clawdviction + onboard + history all gate the spinner)
  5. Not enough ClawdViction (<1M token-seconds) → stake CTA
  6. Larva not launched → "Launch Larva" screen
  7. Onboarding not complete → interview inline
  8. Done → chat with auto-greeting from larva on first visit

## Known issue (unresolved, not worth more tokens)
- Stake CTA flashes briefly on chat page before chat loads
- Root cause: clawdviction API sometimes returns 0 on first call before correcting on interval
- May resolve itself with better RPC (Alchemy key now set properly)

## Onboarding interview (8 questions)
- File: `packages/nextjs/components/OnboardingInterview.tsx`
- Questions defined in `packages/nextjs/lib/questions.ts` (imported by both component + server routes)
- Draft autosaved to localStorage on every keystroke (key: `clawdviction-onboard-draft-${address}`)
- **8 questions (ids):** identity, holder_value, staking_mechanics, build_priorities, risk_tolerance, hard_lines, magic_wand, vision_concern
- build_priorities has checklist + notes sub-field; risk_tolerance has scale (1-5) + notes sub-field

## Staking mechanics
- `stake(amount)` → creates new slot in `stakes[user][]` array
- `unstake(stakeIndex)` → uses **original array index**, not display index
- UI multicalls to resolve real indices before unstaking
- Min stake: 1,000 CLAWD
- ClawdViction threshold for chat: 1M token-seconds

## UI
- Dark mode forced (daisyUI `data-theme="dark"`, Tailwind `dark`, next-themes `forcedTheme="dark"`)
- Lobster dark red theme (primary #cc2b2b on base-100 #1e0a0a)
- Chat window: `max-w-5xl`, `text-base`, Shift+Enter for newlines
- Textarea input (not text input) — allows multiline messages

## Alchemy RPC
- Key: `8GVG8WjDs-sGFRr6Rm839`
- Set in `.env.local` as `NEXT_PUBLIC_ALCHEMY_API_KEY`
- Set in Vercel (all 3 envs) via CLI on 2026-02-26

## Git
- Repo: `https://github.com/clawdbotatg/clawdviction`
- Auto-deploys to `clawdviction.vercel.app` on push to main
- Latest commit: `fefd172` (2026-02-26) — char limits on onboarding Q&A

## Latest commits (2026-02-26)
- `fefd172` — char limits on onboarding Q&A with live counter
- `6c24bdb` — inject full raw onboarding Q&A into larva system prompt (no more summaries)
- `fd6969f` — update CONTEXT.md
- `82faeb6` — base64-encode auth message header, reset clawdviction on auth
- `a5390d8` — auth, chat UX, onboarding polish, loader fixes, alchemy RPC

## Off-Chain ClawdViction System (2026-02-26)

Architecture change: ClawdViction scores moved from on-chain reads to off-chain Neon Postgres.

### New DB Table: `clawdviction_balances`
- `wallet` (PK), `balance` (materialized token-seconds), `last_accrued_at`, `accrual_rate` (current staked tokens for optimistic frontend), `total_earned`, `total_spent`

### Cron: `/api/cron/accrue` (every 1 min via Vercel Cron)
- Iterates all wallets from `larva_seeds` + `clawdviction_balances`
- Reads active stakes from contract, calculates pending token-seconds, upserts balances
- Auth: `CRON_SECRET` env var

### API: `/api/clawdviction/[wallet]`
- Reads from DB (with contract fallback + seeding for first-time users)
- Returns `balance`, `accrualRate`, `lastAccruedAt` for optimistic frontend counter

### Spending
- Chat messages deduct 10,000 token-seconds per message from balance
- Materializes pending accrual before deducting, floors at 0

### Frontend
- Optimistic live counter on stake page — ticks up every second using `balance + accrualRate * elapsed`
- Polling reduced to 30s (was 2s) since counter is client-side
- `vercel.json` added at `packages/nextjs/vercel.json` for cron config

### API: `GET /api/cv/highest`
- Returns the highest live CV balance across all wallets at that moment
- Live CV = materialized balance + (accrual_rate * elapsed_seconds / DIVISOR) where DIVISOR = 1728000 * 1e18
- Response: `{ success: true, highestCVBalance: number }` (rounded to 2 decimal places)
- No auth required — public endpoint with CORS open (*)
- Use case: dynamic pricing based on top CV holder

### Env Vars Needed
- `CRON_SECRET` — for Vercel cron auth (add to Vercel env vars)
