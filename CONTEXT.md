# ClawdViction — Dev Context

## What it is
- Frontend: Next.js app at `/Users/clawd/clawd/clawdviction/packages/nextjs`
- Staking contract: **live on Base mainnet** at `0xAF206d40F293f5892ce86986BaFF5BB426a188a1`
- Real $CLAWD token: `0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07`
- Dev server runs locally at `http://localhost:3000`
- **No Express backend in use** — `NEXT_PUBLIC_BACKEND_URL` is unset, all API routes go through Next.js → Neon Postgres

## Database
- **Neon Postgres** (not SQLite) — env vars in `packages/nextjs/.env.local`
- Tables: `larva_seeds` (onboarding), `chat_messages`, `memory_snapshots`
- ⚠️ Wallet addresses stored **mixed-case (checksummed)** — never use `lower()` when querying

## Architecture
- ClawdViction score read directly from contract via Next.js API (`/api/clawdviction/[wallet]`)
- Onboarding answers → Neon via `/api/onboard/[wallet]`
- Chat history → Neon via `/api/chat/history/[wallet]`
- AI chat → Anthropic (Haiku) called directly from Next.js API
- Larva runs as a background agent spawned per wallet

## Key UX flows (as of today)
- **Nav:** Home → Stake → Chat → About (Onboard tab removed)
- **Chat page** is the single entry point:
  1. Not connected → connect wallet prompt
  2. Not enough ClawdViction (<1M token-seconds) → stake CTA
  3. Larva not launched → launch button
  4. Onboarding not complete → interview inline (no separate tab)
  5. Done → chat
- **No confirmation screen** after onboarding — goes straight to chat

## Onboarding interview
- File: `packages/nextjs/components/OnboardingInterview.tsx`
- Questions file (design doc): `packages/nextjs/app/onboard/INTERVIEW_QUESTIONS.md`
- **9 questions** (as of today):
  1. Who are you
  2. Holder value
  3. Staking lockup + burn split (treasury-funded, not yield)
  4. What to build (checklist, no wallet insurance option)
  5. AI thesis
  6. Risk tolerance (1–5 scale)
  7. Hard lines
  8. Magic wand
  9. Vision + concern (1 year, not 3)

## Staking mechanics
- `stake(amount)` → creates new slot in `stakes[user][]` array
- `unstake(stakeIndex)` → uses **original array index**, not display index
- Multiple stakes are fine, ClawdViction adds up correctly
- **Bug fixed today:** `getActiveStakes()` filters empty slots but doesn't return original indices — UI now does a multicall to resolve real indices before unstaking
- Min stake: 1,000 CLAWD

## UI state
- Dark mode forced (daisyUI `data-theme="dark"`, Tailwind `dark`, next-themes `forcedTheme="dark"`)
- Theme switcher removed from footer

## Things still TODO / known issues
- Q3 in the onboarding (staking mechanics question) was redesigned in INTERVIEW_QUESTIONS.md but the frontend QUESTIONS array in OnboardingInterview.tsx already has the new text — they're in sync
- The `/onboard` route now just redirects to `/chat`
