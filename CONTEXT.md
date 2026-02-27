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

## Architecture
- ClawdViction score read directly from contract via Next.js API (`/api/clawdviction/[wallet]`)
- Onboarding answers → Neon via `/api/onboard/[wallet]`
- Chat history → Neon via `/api/chat/history/[wallet]`
- AI chat → Anthropic (Haiku) called directly from Next.js API
- Auto-greeting on first chat: `/api/chat/greet` — reads onboarding brief, generates personalized hello

## Auth (wallet signature)
- `hooks/useAuth.ts` — signs message on first visit, stores in localStorage for 1 week
- `lib/authFetch.ts` — wraps fetch with auth headers (message is **base64-encoded** to avoid \n in headers)
- `lib/verifyAuth.ts` — server-side: decodes base64 message, verifies sig with viem, returns lowercase address
- **Only required on /chat** — stake/about/home are fully public
- Protected routes: `/api/chat`, `/api/chat/greet`, `/api/chat/history/[wallet]`, `/api/onboard/[wallet]`, `/api/larva/[wallet]/launch`
- Public routes: `/api/clawdviction/[wallet]`, `/api/larva/[wallet]/status`

## Key UX flows
- **Nav:** Home → Stake → Chat → About
- **Chat page** is the single entry point:
  1. Not connected → connect wallet prompt
  2. Wallet reconnecting → spinner
  3. Not signed → "Connect to $CLAWD Larvae" sign-in screen
  4. All data loading → spinner (clawdviction + onboard + history all gate the spinner)
  5. Not enough ClawdViction (<1M token-seconds) → stake CTA
  6. Onboarding not complete → interview inline
  7. Done → chat with auto-greeting from larva on first visit
- **Stake + Home** — same spinner pattern (mounted + walletStatus reconnecting gate)

## Known issue (unresolved, not worth more tokens)
- Stake CTA flashes briefly on chat page before chat loads
- Root cause: clawdviction API sometimes returns 0 on first call before correcting on interval
- Attempts: null gate, clawdviction reset on auth, Promise.allSettled — all partially helped but flash persists
- May resolve itself with better RPC (Alchemy key now set properly)

## Onboarding interview (8 questions)
- File: `packages/nextjs/components/OnboardingInterview.tsx`
- Draft autosaved to localStorage on every keystroke (key: `clawdviction-onboard-draft-${address}`)
- **8 questions:**
  1. Who are you
  2. What do you get for holding CLAWD? What do you wish you got?
  3. Staking lockup & burn split (e.g. 3 month lockup, 1% earned, 2% burned — paid from treasury)
  4. What should we build (broad categories: games, AI agents, trading, social, revenue/burns)
  5. Risk tolerance (1–5 scale)
  6. Hard lines
  7. Magic wand
  8. Vision & honest concern (1 year)

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
- Latest commit: `82faeb6` (2026-02-26)
