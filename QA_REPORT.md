# QA Audit Report — ClawdViction

**Date:** 2026-02-25  
**Auditor:** Automated QA (Opus)  
**Overall Status:** ⚠️ ISSUES FOUND (no ship-blockers, several should-fix items)

## Summary Table

| Category | Pass | Warn | Fail |
|----------|------|------|------|
| Ship-Blocking | 7 | 0 | 0 |
| Should Fix | 5 | 4 | 4 |
| Frontend UX | 8 | 1 | 2 |
| Frontend Playbook | 3 | 1 | 1 |

---

## 🚨 Ship-Blocking Checks

| # | Check | Status |
|---|-------|--------|
| 1 | Wallet connection shows a BUTTON | ✅ PASS — `btn btn-primary btn-sm` "Connect Wallet" in `RainbowKitCustomConnectButton/index.tsx:37` |
| 2 | Wrong network shows Switch button | ✅ PASS — `WrongNetworkDropdown` renders `btn btn-error` with `NetworkOptions` switch UI |
| 3 | One button at a time (Connect → Network → Approve → Action) | ✅ PASS — `stake/page.tsx` has `isWrongNetwork ? ... : needsApproval ? ... : stake` flow |
| 4 | Approve button disabled with spinner through confirmation | ✅ PASS — `disabled={isApproving}` + `loading-spinner` shown during approve |
| 5 | SE2 footer branding removed | ✅ PASS — Footer shows GitHub/Twitter links only, no BuidlGuidl/SE2 branding |
| 6 | SE2 tab title removed | ✅ PASS — Title is "ClawdViction", template is `%s | ClawdViction` |
| 7 | SE2 README replaced | ✅ PASS — README is project-specific "🦀 ClawdViction" |

---

## Should Fix Checks

| # | Check | Status | Details |
|---|-------|--------|---------|
| 1 | Contract address with `<Address/>` | ✅ PASS | `stake/page.tsx:233` displays staking contract with `<Address/>` |
| 2 | USD values next to token amounts | ✅ PASS | CLAWD/ETH price from Uniswap pool, USD shown for staked + balance |
| 3 | OG image is absolute production URL | ⚠️ WARNING | Uses `VERCEL_PROJECT_PRODUCTION_URL` env var — correct pattern but falls back to `localhost` if unset. Verify env var is set on Vercel. (`getMetadata.ts:4`) |
| 4 | pollingInterval is 3000 | ✅ PASS | `scaffold.config.ts:30` — `pollingInterval: 3000` |
| 5 | RPC overrides set | ✅ PASS | `scaffold.config.ts:36` — Base mainnet Alchemy override configured |
| 6 | Favicon updated | ⚠️ WARNING | `favicon.png` exists but cannot verify it's not the SE2 default without visual inspection |
| 7 | No hardcoded dark backgrounds | ⚠️ WARNING | Uses `background-image: url('/bg.jpg')` on `:root` in `globals.css:72` — custom bg image instead of semantic colors. Works but non-standard. |
| 8 | Phantom wallet in RainbowKit | ✅ PASS | `wagmiConnectors.tsx:10` imports `phantomWallet` and includes it in wallets array |
| 9 | Mobile: TX buttons deep link to wallet | ❌ FAIL | `openWalletDeepLink` in `stake/page.tsx:123` uses `wc://` which is not a valid deep link scheme. Should use proper WalletConnect/MetaMask deep links. Also `setTimeout` delay is 1500ms, should be 2000ms. |
| 10 | Mobile: wallet detection checks WC session data | ❌ FAIL | `stake/page.tsx:123` only checks `window.ethereum` — doesn't check WC session data or `connector.id` |
| 11 | Mobile: no deep link when `window.ethereum` exists | ⚠️ WARNING | Logic is inverted — deep link is skipped when `window.ethereum` exists, which is correct behavior, but the deep link target (`wc://`) is invalid |
| 12 | Env var confirmed set on hosting | ❌ FAIL | `NEXT_PUBLIC_ALCHEMY_API_KEY` falls back to default SE2 key `cR4WnXePioePZ5fFrnSiR` — must confirm env var is set on Vercel |

---

## Frontend UX Checks

| # | Check | Status | Details |
|---|-------|--------|---------|
| 1 | Every onchain button has separate loading state | ✅ PASS | Separate hooks: `isApproving`, `isStaking`, `isUnstaking`, `isFauceting` + per-index unstake tracking |
| 2 | useScaffoldWriteContract used (not raw wagmi) | ✅ PASS | All writes use `useScaffoldWriteContract`. No raw `useWriteContract` found in app code. |
| 3 | Address display uses `<Address/>` | ✅ PASS | Contract address displayed with `<Address/>` component |
| 4 | Address input uses `<AddressInput/>` | ⚠️ WARNING | No address input fields exist in the app — N/A |
| 5 | Contract address at bottom of main page | ✅ PASS | Staking contract shown at bottom of `/stake` page |
| 6 | USD values everywhere | ✅ PASS | USD values shown for staked amount and balance via Uniswap price |
| 7 | No duplicate h1 matching header | ✅ PASS | No `<h1>` tags in page.tsx or stake/page.tsx |
| 8 | DaisyUI semantic colors | ✅ PASS | Uses `bg-base-200`, `text-base-content`, `btn-primary`, etc. throughout |
| 9 | No raw useWriteContract | ✅ PASS | `grep -rn "useWriteContract"` returns no matches outside scaffold internals |
| 10 | No hardcoded dark backgrounds in app/ | ✅ PASS | No matches for `bg-[#0`, `bg-black`, `bg-gray-9`, etc. |
| 11 | Bare `http()` in wagmiConfig fallback | ❌ FAIL | `wagmiConfig.tsx` has `http()` (bare, no URL) in the fallback array. This falls back to public RPCs which are unreliable. Remove it. |

---

## Frontend Playbook Checks

| # | Check | Status | Details |
|---|-------|--------|---------|
| 1 | next.config.ts IPFS-safe patterns | ✅ PASS | `next.config.ts` conditionally sets `output: "export"`, `trailingSlash: true`, `images.unoptimized: true` when `NEXT_PUBLIC_IPFS_BUILD=true` |
| 2 | polyfill-localstorage.cjs exists | ❌ FAIL | File does not exist at `packages/nextjs/polyfill-localstorage.cjs` — needed for Node 25+ |
| 3 | OG image is absolute URL | ✅ PASS | `getMetadata.ts` constructs absolute URL via `baseUrl + imageRelativePath` |
| 4 | Metadata fully set | ✅ PASS | title, description, openGraph, twitter card all configured in `getMetadata.ts` |
| 5 | All routes work on IPFS | ⚠️ WARNING | `trailingSlash` only enabled when `NEXT_PUBLIC_IPFS_BUILD=true` — correct for conditional IPFS builds |

---

## Verdict

**No ship-blocking issues found.** The app can ship, but the following should be fixed:

### Priority Fixes
1. **❌ Bare `http()` in wagmiConfig.tsx** — Remove the bare `http()` from the fallback array to avoid public RPC fallback
2. **❌ Mobile deep link broken** — `wc://` is not a valid deep link. Implement proper wallet deep linking with correct scheme and 2000ms delay (`stake/page.tsx:123-126`)
3. **❌ Mobile wallet detection** — Check WC session data, not just `window.ethereum` (`stake/page.tsx:123`)
4. **❌ polyfill-localstorage.cjs missing** — Create this file for Node 25+ compatibility
5. **❌ Verify Alchemy API key env var** — Confirm `NEXT_PUBLIC_ALCHEMY_API_KEY` is set on Vercel (currently falls back to default SE2 key)

### Nice to Have
- Verify favicon.png is custom (not SE2 default)
- Verify `VERCEL_PROJECT_PRODUCTION_URL` is set for correct OG image URLs
