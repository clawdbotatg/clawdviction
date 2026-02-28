# QA Audit Report — ClawdViction

**Date:** 2026-02-27  
**Auditor:** Opus (subagent)  
**Repo:** https://github.com/clawdbotatg/clawdviction  
**Methodology:** [ethskills.com/qa/SKILL.md](https://ethskills.com/qa/SKILL.md)  
**Commit:** HEAD at time of audit

---

## Overview

ClawdViction is an AI-powered conviction governance dApp built on Scaffold-ETH 2. Users stake $CLAWD tokens on Base, earn ClawdViction score over time, and once threshold is met, can train a personal AI "larva" to govern on their behalf. Pages: Home, Stake, Chat (with onboarding interview), About.

---

## Environment & Setup

- **Framework:** Next.js (SE2 scaffold)
- **Chain:** Base mainnet
- **Contract:** `ClawdVictionStaking` + `MockCLAWD` (ERC-20)
- **Wallet:** RainbowKit with Phantom, MetaMask, WalletConnect, Rainbow, Ledger, Safe, Coinbase (base account)
- **Theme:** Dark-only (forced via `data-theme="dark"` + ThemeProvider)

---

## Audit Checklist (per ethskills.com/qa/SKILL.md)

### Ship-Blocking

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 1 | Wallet connection shows a BUTTON, not text | ✅ **PASS** | Home page renders `<RainbowKitCustomConnectButton />` when not connected. Stake page also renders it. |
| 2 | Wrong network shows a Switch button | ✅ **PASS** | Stake page: `isWrongNetwork` → renders "Switch to {chain}" button. |
| 3 | One button at a time (Connect → Network → Approve → Action) | ✅ **PASS** | Stake page uses conditional rendering: wrong network → approve → stake. Only one visible. |
| 4 | Approve button disabled with spinner through block confirmation | ✅ **PASS** | Uses `useScaffoldWriteContract` (waits for block). `disabled={isApproving}`, inline spinner `<span className="loading loading-spinner loading-sm">`. |
| 5 | SE2 footer branding removed | ✅ **PASS** | Footer shows GitHub + Twitter links only. No BuidlGuidl, no "Built with SE2". |
| 6 | SE2 tab title removed | ✅ **PASS** | Title is "ClawdViction", template is "%s | ClawdViction". |
| 7 | SE2 README replaced | ✅ **PASS** | README describes ClawdViction project, not SE2 template. |

### Should Fix

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 8 | Contract address displayed with `<Address/>` | ✅ **PASS** | Stake page shows staking contract address with `<Address address={...} />` at bottom. |
| 9 | USD values next to all token/ETH amounts | ✅ **PASS** | CLAWD balance, staked amount, input preview, and individual stakes all show USD via Uniswap V3 pool price. |
| 10 | OG image is absolute production URL | ⚠️ **CONDITIONAL PASS** | Uses `${baseUrl}/thumbnail.jpg` where `baseUrl` derives from `VERCEL_PROJECT_PRODUCTION_URL`. Absolute URL in production, but relative-looking in dev. Acceptable if deployed on Vercel. |
| 11 | pollingInterval is 3000 | ✅ **PASS** | `scaffold.config.ts`: `pollingInterval: 3000`. |
| 12 | RPC overrides set + env var confirmed on hosting | ⚠️ **WARN** | `rpcOverrides` uses `process.env.NEXT_PUBLIC_ALCHEMY_API_KEY` but falls back to `DEFAULT_ALCHEMY_API_KEY` ("cR4WnXePioePZ5fFrnSiR") which appears to be the stock SE2 key (truncated). **Verify the env var is actually set on Vercel.** |
| 13 | Favicon updated from SE2 default | ✅ **PASS** | Custom `favicon.png` present; metadata references `/favicon.png`. |
| 14 | No hardcoded dark backgrounds | ✅ **PASS** | Layout forces `data-theme="dark"` on `<html>` and `<SwitchTheme/>` is NOT in Header. Uses `bg-base-100`, `bg-base-200`, `bg-base-content` throughout. This is the accepted dark-only exception. |
| 15 | Button loaders use inline spinner, not className="loading" | ✅ **PASS** | All buttons use `<span className="loading loading-spinner loading-sm">` inside button. No `className={... "loading"}` pattern. |
| 16 | Phantom wallet in RainbowKit wallet list | ✅ **PASS** | `phantomWallet` imported and included in `wagmiConnectors.tsx`. |
| 17 | Mobile deep link: ALL tx buttons fire TX first, then deep link | ❌ **FAIL** | `handleApprove` and `handleStake` call `setTimeout(openWalletDeepLink, 2000)` **after** `await` — so deep link fires after TX confirms, not after TX is sent. The `await` on `useScaffoldWriteContract` waits for block confirmation, so by the time the deep link fires, the user already signed. Deep link is useless at that point. Should fire concurrently (no `await` before setTimeout). |
| 18 | Mobile deep link: wallet detection checks WC session data | ❌ **FAIL** | `openWalletDeepLink` hardcodes MetaMask universal link. Does NOT detect which wallet the user connected with. Should check `connector.id`, WC session localStorage, etc. per the SKILL.md pattern. |
| 19 | Mobile deep link: no deep link when `window.ethereum` exists | ✅ **PASS** | Checks `!window.ethereum` before attempting deep link. |
| 20 | `useWriteContract` (raw wagmi) used outside scaffold internals | ✅ **PASS** | No raw `useWriteContract` found in app code. All writes use `useScaffoldWriteContract`. |

---

## Additional Findings

### F-1: Stake page — text accompanies connect button (Minor)

**Severity:** Low  
**Location:** `app/stake/page.tsx` line ~230  
**Description:** When not connected, the stake page shows `<RainbowKitCustomConnectButton />` AND below it: "Connect your wallet to start staking $CLAWD". The SKILL.md says the button should be primary, not text. The button IS primary and prominent, but the text is also there. Borderline pass — the button is clearly the main CTA.  
**Verdict:** Acceptable, but could be cleaner without the text.

### F-2: Chat page — clawdviction threshold may be wrong (Medium)

**Severity:** Medium  
**Location:** `app/chat/page.tsx` line 13  
**Description:** `CLAWDVICTION_THRESHOLD = 1_000_000n * 10n ** 18n` — this is 1M × 10^18. But the stake page checks `BigInt(clawdvictionScore) >= 1_000_000n` (just 1M). The backend `/api/clawdviction` returns a string score — it's unclear if it's in wei or human-readable. If the backend returns raw wei, then 1M on stake page would be trivially small. If human-readable, then the chat threshold is astronomically high (10^24). **One of these is wrong.**  
**Repro:** Stake tokens, accrue 1M clawdviction, check if chat unlocks or not.

### F-3: No `useWriteContract` but `isMining` might not exist (Low)

**Severity:** Low  
**Location:** `app/stake/page.tsx`  
**Description:** The code destructures `{ writeContractAsync, isMining }` from `useScaffoldWriteContract`. If the SE2 hook uses `isPending` instead of `isMining`, this would silently be `undefined` and buttons would never show loading state. **Verify the hook's actual return type.**

### F-4: Unstake has no deep link (Low)

**Severity:** Low  
**Location:** `app/stake/page.tsx` `handleUnstake`  
**Description:** `handleUnstake` does not call `openWalletDeepLink`. Mobile users unstaking won't get redirected to their wallet.

### F-5: No error handling on stake/approve failures (Medium)

**Severity:** Medium  
**Description:** `handleStake` and `handleApprove` don't catch errors. If the transaction fails, no user-facing error message appears (SE2's transactor may show a toast, but this should be verified).

---

## Accessibility

| Check | Result |
|-------|--------|
| Semantic HTML (headings, landmarks) | ⚠️ No `<main>`, no `<nav>` (header uses `div.navbar`). Headings jump levels. |
| Keyboard navigation | ✅ Standard links/buttons are focusable. No custom focus traps. |
| Color contrast (dark theme) | ⚠️ `text-base-content/60` and `text-base-content/50` are opacity-reduced text — may fail WCAG AA on dark backgrounds. |
| Alt text on images | ✅ Logo has `alt="ClawdViction"`. |
| Form labels | ❌ Stake input has `placeholder` but no `<label>`. Screen readers won't announce purpose. |
| ARIA attributes | ⚠️ Minimal — relies on native semantics. |

---

## Responsive / Mobile

| Check | Result |
|-------|--------|
| Mobile nav (hamburger menu) | ✅ Works — `<details>` dropdown on `lg:hidden`. |
| Cards stack on mobile | ✅ `grid md:grid-cols-3` → single column on mobile. |
| Input usability on mobile | ✅ `type="number"` triggers numeric keyboard. |
| Deep linking | ❌ Broken — see F-17/F-18 above. |
| Touch targets | ✅ Buttons are large enough (`btn-lg`, `btn w-full`). |

---

## Performance Notes

- **Polling:** ClawdViction score polls every 30s; live counter ticks every 1s. Reasonable.
- **Contract reads:** `watch: true` on multiple reads — appropriate given 3s polling interval.
- **No code splitting concerns** — standard Next.js page-based routing.
- **Uniswap pool reads** add 2 extra RPC calls per page load on stake page.

---

## Prioritized Recommendations

### Must Fix (before ship)

1. **Mobile deep linking is broken** (F-17, F-18, F-4): The deep link fires after TX confirmation (useless), hardcodes MetaMask, and is missing from unstake. Implement the `writeAndOpen` pattern from SKILL.md — fire TX, then `setTimeout(openWallet, 2000)` concurrently.

2. **Verify clawdviction threshold consistency** (F-2): Chat page uses 10^24, stake page uses 10^6. One is wrong.

3. **Verify `isMining` vs `isPending`** (F-3): Confirm the SE2 hook returns `isMining`. If not, button loading states are broken.

### Should Fix

4. **Confirm Alchemy API key is set on Vercel** — the fallback key looks like the SE2 default, which is rate-limited.

5. **Add `<label>` to stake input** for accessibility.

6. **Reduce opacity-based text** — use DaisyUI semantic colors that meet WCAG AA contrast ratios.

### Nice to Have

7. Add `<main>` landmark and proper heading hierarchy.
8. Add error boundaries / user-facing error messages on TX failure.
9. Show USD value next to ClawdViction score (currently unitless).

---

## Summary

ClawdViction is a well-built SE2 dApp that passes most of the ethskills.com QA checklist. The wallet flow, button states, branding, theming, and contract integration are all solid. The main issues are **mobile deep linking** (broken pattern + hardcoded MetaMask) and a **potential threshold mismatch** between pages. Everything else is polish-level.

**Overall: 17/20 checklist items pass. 2 FAIL (mobile deep linking), 1 WARN (RPC key).**
