# Frontend QA Audit Report — ClawdViction

**Date:** 2026-03-02  
**Repo:** [github.com/clawdbotatg/clawdviction](https://github.com/clawdbotatg/clawdviction)  
**Live URL:** Not explicitly set in repo. Deployed on Vercel (URL likely `clawdviction.vercel.app` — not confirmed in code).  
**Auditor:** leftclaw (automated)

---

## Summary Table

| # | Check | Result | Severity |
|---|-------|--------|----------|
| 1 | Wallet Flow — Button Not Text | ✅ PASS | — |
| 2 | Four-State Button Flow | ✅ PASS | — |
| 3 | useWriteContract (outside SE2 internals) | ✅ PASS | — |
| 4 | approveCooldown (4s setTimeout) | ✅ PASS | — |
| 5 | SE2 Branding — Footer | ✅ PASS | — |
| 6 | SE2 Branding — Tab Title | ✅ PASS | — |
| 7 | SE2 Branding — README | ✅ PASS | — |
| 8 | SE2 Branding — Favicon | ⚠️ UNCLEAR | NICE-TO-HAVE |
| 9 | Contract Address Display | ✅ PASS | — |
| 10 | USD Values | ✅ PASS | — |
| 11 | OG Image Absolute URL | ✅ PASS | — |
| 12 | Polling Interval 3000 | ✅ PASS | — |
| 13 | Dark Mode — No Hardcoded Dark Backgrounds | ✅ PASS | — |
| 14 | Phantom Wallet in RainbowKit | ✅ PASS | — |
| 15 | Mobile Deep Linking | ✅ PASS | — |
| 16 | Contract Verification on Block Explorer | ✅ PASS | — |
| 17 | Button Loading State (spinner inside) | ✅ PASS | — |
| 18 | Fork Mode Setup | ✅ PASS | — |
| 19 | IPFS Configuration | ✅ PASS | — |
| 20 | Vercel Configuration | ✅ PASS | — |
| 21 | OG Metadata — NEXT_PUBLIC_PRODUCTION_URL | ❌ FAIL | SHOULD-FIX |
| 22 | ENS Subdomain (.eth.link) | N/A | — |
| 23 | Rule 1: Loader + Disable on every onchain button | ✅ PASS | — |
| 24 | Rule 3: Address Display — Always <Address/> | ✅ PASS | — |
| 25 | Rule 4: USD Values Everywhere | ✅ PASS | — |
| 26 | Rule 5: No Duplicate Titles | ✅ PASS | — |
| 27 | Rule 6: RPC Configuration | ⚠️ PARTIAL | SHOULD-FIX |
| 28 | Rule 7: DaisyUI Semantic Colors | ✅ PASS | — |
| 29 | Rule 8: Pre-Publish — twitter.card | ✅ PASS | — |
| 30 | Rule 8: Pre-Publish — No hardcoded localhost | ✅ PASS | — |
| 31 | externalContracts.ts | N/A | — |
| 32 | Human-Readable Amounts (formatEther/parseEther) | ✅ PASS | — |
| 33 | SwitchTheme removed (dark-only) | ✅ PASS | — |
| 34 | Live URL in repo/README | ❌ FAIL | SHOULD-FIX |

---

## Detailed Findings

### ✅ PASS — Wallet Flow (Button Not Text)
- `packages/nextjs/app/page.tsx`: Uses `<RainbowKitCustomConnectButton />` when not connected. Big "Start Staking 🦞" button when connected.
- `packages/nextjs/app/stake/page.tsx`: Shows `<RainbowKitCustomConnectButton />` when disconnected. No text-only connect instructions.

### ✅ PASS — Four-State Button Flow
- `packages/nextjs/app/stake/page.tsx` lines ~400-440: Three-state conditional rendering:
  1. `isWrongNetwork` → "Switch to {chain}" button
  2. `needsApproval` → "Approve $CLAWD" button (disabled during `isApproving || approveCooldown`)
  3. Otherwise → "Stake 🦀" button (disabled during `isStaking`)
- Only ONE button visible at a time ✅
- `approveCooldown` state with 4s `setTimeout` after approve ✅

### ✅ PASS — useWriteContract not used outside SE2 internals
- `grep -rn "useWriteContract" packages/nextjs/` returns no matches outside SE2 scaffold hooks.
- All writes use `useScaffoldWriteContract`.

### ✅ PASS — SE2 Branding Removal
- **Footer** (`packages/nextjs/components/Footer.tsx`): No BuidlGuidl links, no "Built with SE2", no "Fork me". Links to project GitHub and Twitter only.
- **Tab title** (`packages/nextjs/app/layout.tsx`): `getMetadata({ title: "ClawdViction" })`. Template: `"%s | ClawdViction"`.
- **README**: Describes ClawdViction project, not SE2.

### ⚠️ UNCLEAR — Favicon
- `packages/nextjs/public/favicon.png` exists. Cannot verify visually whether it's the SE2 default or custom. Likely custom given other branding is clean.

### ✅ PASS — Contract Address Display
- `packages/nextjs/app/page.tsx`: Shows staking contract address via `<Address address={stakingContractData.address} />`.
- `packages/nextjs/app/stake/page.tsx`: Same at bottom of page.

### ✅ PASS — USD Values
- `packages/nextjs/app/stake/page.tsx`: Calculates `clawdUsdPrice` from Uniswap V3 pool + ETH price. Shows USD next to:
  - Staked amount (`$X.XX`)
  - Wallet balance (`($X.XX)`)
  - Input amount preview (`≈ $X.XX`)
  - Each active stake (`($X.XX)`)

### ✅ PASS — OG Image Absolute URL
- `packages/nextjs/utils/scaffold-eth/getMetadata.ts`: `const imageUrl = \`${baseUrl}${imageRelativePath}\``
- `baseUrl` = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` in production → absolute URL ✅
- `thumbnail.jpg` exists in `packages/nextjs/public/`

### ❌ FAIL — OG Metadata: NEXT_PUBLIC_PRODUCTION_URL not used
- **File:** `packages/nextjs/utils/scaffold-eth/getMetadata.ts` line 3
- Uses `VERCEL_PROJECT_PRODUCTION_URL` (server-side only, auto-set by Vercel) instead of `NEXT_PUBLIC_PRODUCTION_URL`.
- This works on Vercel but means the OG URL falls back to `localhost:3000` in non-Vercel builds (IPFS, self-hosted).
- **Severity:** SHOULD-FIX — works on Vercel, breaks elsewhere.

### ✅ PASS — Polling Interval
- `packages/nextjs/scaffold.config.ts`: `pollingInterval: 3000`

### ✅ PASS — No Hardcoded Dark Backgrounds
- `grep -rn 'bg-[#0|bg-black|bg-gray-9|bg-zinc-9|bg-neutral-9|bg-slate-9' packages/nextjs/app/` returns no matches.
- Uses DaisyUI semantic: `bg-base-100`, `bg-base-200`, `text-base-content` throughout.

### ✅ PASS — Phantom Wallet
- `packages/nextjs/services/web3/wagmiConnectors.tsx`: `phantomWallet` imported and included in wallet list.

### ✅ PASS — Mobile Deep Linking
- `packages/nextjs/app/stake/page.tsx`: `writeAndOpen` helper fires TX first, then `setTimeout(openWallet, 2000)`.
- `openWallet` detects mobile UA, checks connector/WC session for wallet name, opens appropriate URL scheme.
- Supports: Rainbow, MetaMask, Coinbase, Trust, Phantom.

### ✅ PASS — Contract Verification
- `ClawdVictionStaking` at `0xC9E377FB98a1aA6Ecf4B553cE1b57940121213bf` on Base: **"Contract Source Code Verified (Exact Match)"** on BaseScan.
- `MockCLAWD` at `0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07`: This is the real $CLAWD token (aliased as MockCLAWD for scaffold hooks) — not our contract to verify.

### ✅ PASS — Button Loading State
- All buttons use `<span className="loading loading-spinner loading-sm"></span>` inside the button, not `className="loading"` on the button itself.
- Approve, Stake, Unstake, Faucet all have proper spinner + disabled patterns.

### ✅ PASS — RPC Configuration
- `scaffold.config.ts`: `rpcOverrides` set for Base chain ID with Alchemy URL.
- `pollingInterval: 3000`.

### ⚠️ PARTIAL — Bare http() fallback
- **File:** `packages/nextjs/services/web3/wagmiConfig.tsx` line 34
- `if (rpcFallbacks.length === 0) rpcFallbacks = [http()];` — bare `http()` exists as last-resort fallback.
- In practice this never fires for Base (rpcOverrides always provides a URL), but the code path exists.
- **Severity:** SHOULD-FIX — defensive but could leak to public RPC.

### ✅ PASS — DaisyUI Semantic Colors + Dark-Only Mode
- `packages/nextjs/app/layout.tsx`: `data-theme="dark"` on `<html>`, `ThemeProvider forcedTheme="dark"`.
- `SwitchTheme` component exists but is NOT imported/used anywhere outside its own file.

### ✅ PASS — No Duplicate h1 Titles
- h1 tags found in: about, not-found, debug, gov pages. None duplicate the header nav title.

### ✅ PASS — Human-Readable Amounts
- `formatEther` used for all display values. `parseEther` for contract calls. No raw wei shown.

### ❌ FAIL — Live URL Not Documented
- README says "Deployed on Vercel" but does not include the actual URL.
- PRODUCTION_PLAN.md references Vercel but no concrete URL.
- **Severity:** SHOULD-FIX — users/reviewers can't find the live app.

### ✅ PASS — IPFS Configuration
- `packages/nextjs/next.config.ts`: Properly guards IPFS config behind `NEXT_PUBLIC_IPFS_BUILD === "true"`.
- Sets `output: "export"`, `trailingSlash: true`, `images: { unoptimized: true }`.

### ✅ PASS — Vercel Configuration
- `vercel.json` exists with cron jobs. Vercel auto-detects Next.js — no root directory override needed when repo root has the workspace config.

---

## Final Verdict

### 🟢 SHIP-READY

No ship-blocking issues found. The app implements all critical patterns correctly:
- Proper wallet connect button flow
- Four-state button with approve cooldown
- Loading spinners inside buttons (not className)
- USD values from on-chain Uniswap V3 pool
- Mobile deep linking with TX-first pattern
- SE2 branding fully removed
- Contract verified on BaseScan
- DaisyUI semantic colors, dark-only mode properly configured
- Phantom wallet included
- RPC overrides with Alchemy, polling at 3000ms

### Items to Address (non-blocking)

| Priority | Issue | Fix |
|----------|-------|-----|
| SHOULD-FIX | OG URL uses `VERCEL_PROJECT_PRODUCTION_URL` not `NEXT_PUBLIC_PRODUCTION_URL` | Add `NEXT_PUBLIC_PRODUCTION_URL` env var support for non-Vercel deploys |
| SHOULD-FIX | Bare `http()` fallback in wagmiConfig.tsx line 34 | Remove or replace with explicit RPC URL |
| SHOULD-FIX | Live URL not documented in README | Add the Vercel deployment URL to README |
| NICE-TO-HAVE | Verify favicon is custom (not SE2 default) | Visual check needed |
