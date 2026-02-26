# QA Report — clawdviction
Generated: 2026-02-25
Auditor: LeftClaw 🦞
Repo: https://github.com/clawdbotatg/clawdviction

## Summary

ClawdViction is a $CLAWD staking + AI governance app built on SE2/Base. The core staking flow and four-state button logic are solid, but the app ships with significant SE2 branding baked in across layout, title template, footer, and header. The hardcoded Alchemy RPC key in `rpcOverrides` is an additional ship-blocker. The UI framework is clean with no dark mode hacks.

**Ship-Blocking Issues:** 3
**Should-Fix Issues:** 4
**Passing:** 8

---

## 🚨 Ship-Blocking

### 1. SE2 Branding — Tab Title & Metadata ❌ FAIL

**File:** `packages/nextjs/app/layout.tsx`

```ts
export const metadata = getMetadata({
  title: 'Scaffold-ETH 2 App',         // ← wrong
  description: 'Built with 🏗 Scaffold-ETH 2'  // ← wrong
});
```

**File:** `packages/nextjs/utils/scaffold-eth/getMetadata.ts`

```ts
const titleTemplate = "%s | Scaffold-ETH 2";   // ← every page tab says "Scaffold-ETH 2"
```

The browser tab reads **"Scaffold-ETH 2 App"** and every sub-page appends **"| Scaffold-ETH 2"**. Must be replaced with the app name ("ClawdViction") and a project description.

**Fix:**
```ts
// layout.tsx
export const metadata = getMetadata({
  title: 'ClawdViction',
  description: 'AI-powered conviction governance for $CLAWD holders. Stake. Train. Govern.'
});

// getMetadata.ts
const titleTemplate = "%s | ClawdViction";
```

---

### 2. SE2 Branding — Footer ❌ FAIL

**File:** `packages/nextjs/components/Footer.tsx`

The footer contains hardcoded SE2 attribution links that must not ship:

```tsx
<a href="https://github.com/scaffold-eth/se-2" ...>Fork me</a>
// ...
<p>Built with <HeartIcon /> at</p>
<a href="https://buidlguidl.com/" ...>BuidlGuidl</a>
```

The **"Fork me"** link, **"Built with ❤️ at BuidlGuidl"**, and BuidlGuidl logo all need to be removed or replaced with ClawdViction project links (GitHub, Twitter, etc).

---

### 3. SE2 Branding — Header ❌ FAIL

**File:** `packages/nextjs/components/Header.tsx`

The desktop logo section shows the SE2 identity:

```tsx
<Image alt="SE2 logo" fill src="/logo.svg" />
<span className="font-bold leading-tight">Scaffold-ETH</span>
<span className="text-xs">Ethereum dev stack</span>
```

This must be replaced with the ClawdViction name and logo (the crab emoji or custom SVG).

---

### 4. Hardcoded Alchemy RPC Key in rpcOverrides ❌ FAIL

**File:** `packages/nextjs/scaffold.config.ts`

```ts
rpcOverrides: {
  [chains.base.id]: "https://base-mainnet.g.alchemy.com/v2/8GVG8WjDs-sGFRr6Rm839",
},
```

The Alchemy API key is exposed in plaintext in source. It bypasses the `process.env.NEXT_PUBLIC_ALCHEMY_API_KEY` guard applied to `alchemyApiKey`. The `rpcOverrides` entry will always win and use this hardcoded key.

**Fix:**
```ts
rpcOverrides: {
  [chains.base.id]: `https://base-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || DEFAULT_ALCHEMY_API_KEY}`,
},
```

---

## ⚠️ Should Fix

### 5. Phantom Wallet Missing from RainbowKit ❌ FAIL

**File:** `packages/nextjs/services/web3/wagmiConnectors.tsx`

`phantomWallet` is not in the wallet list. Phantom is a major Solana + Base wallet and a significant segment of DeFi users.

```ts
// Current wallets: metaMask, walletConnect, ledger, baseAccount, rainbow, safe
// Missing: phantomWallet
```

**Fix:**
```ts
import { ..., phantomWallet } from "@rainbow-me/rainbowkit/wallets";

const wallets = [
  metaMaskWallet,
  phantomWallet,   // ← add this
  walletConnectWallet,
  ...
];
```

---

### 6. Connect Wallet — Text Before Button on Inner Pages ⚠️ PARTIAL

**Files:** `stake/page.tsx`, `chat/page.tsx`, `onboard/page.tsx`

All inner pages show a descriptive paragraph _before_ the connect button. The QA standard is button-first as the primary UI element. Current pattern:

```tsx
// stake/page.tsx
<p className="text-base-content/60 mb-6">Connect your wallet to start staking $CLAWD</p>
<RainbowKitCustomConnectButton />

// chat/page.tsx
<p className="text-base-content/60 mb-6">Connect your wallet to meet your larva.</p>
<RainbowKitCustomConnectButton />
```

**Note:** The home page (`page.tsx`) is a PASS — it shows only the button with no "please connect" instruction text. The inner pages should match this pattern: button as primary, text as supplementary.

**Fix:** Move the button above the text, or reduce the text to a small caption below the button.

---

### 7. No USD Value on Token Amounts ❌ FAIL

**File:** `packages/nextjs/app/stake/page.tsx`

All CLAWD balances and stake amounts are shown as raw token numbers with no dollar conversion:

```tsx
<div className="stat-value text-error text-2xl">
  {totalStaked ? Number(formatEther(totalStaked)).toLocaleString() : "0"} CLAWD
</div>

Balance: {clawdBalance ? Number(formatEther(clawdBalance)).toLocaleString() : "0"} CLAWD
```

The footer already fetches native currency price (ETH/USD) via `useFetchNativeCurrencyPrice`. CLAWD will need its own price lookup (e.g., DEX price feed or CoinGecko API), but at minimum the UI should show `~$X.XX` next to balances.

---

### 8. Mobile Deep Linking — writeAndOpen Pattern Missing ❌ FAIL

No `writeAndOpen` or mobile deep-link pattern found anywhere in the codebase. The stake flow fires transactions but never deep-links to the user's mobile wallet after submitting.

The pattern to implement:
```ts
const handleStake = async () => {
  const txPromise = stakeWrite({ functionName: "stake", args: [parsedAmount] });
  // Deep link 2s after tx fires, but only for mobile WalletConnect (not in-app browser)
  if (!window.ethereum) {
    setTimeout(() => openWalletDeepLink(), 2000);
  }
  await txPromise;
};
```

This is important for mobile users on WalletConnect — they need to be returned to their wallet app to approve the transaction.

---

## ✅ All Checks

| Check | Result | Notes |
|-------|--------|-------|
| Wallet Flow: Button not text (home page) | ✅ PASS | `page.tsx` shows `RainbowKitCustomConnectButton` as primary element, no instructional text |
| Wallet Flow: Button not text (inner pages) | ⚠️ PARTIAL | Descriptive text precedes button on stake/chat/onboard pages |
| Four-State Button Flow | ✅ PASS | Stake page correctly shows: not connected → connect, wrong network → switch, needs approval → approve (spinner, disabled), ready → stake. One button at a time. |
| Approve button disabled while pending | ✅ PASS | `disabled={isApproving}` prevents double-click during TX |
| No raw `useWriteContract` | ✅ PASS | `grep -rn "useWriteContract" packages/nextjs/` returns no matches outside scaffold internals |
| Uses `useScaffoldWriteContract` | ✅ PASS | All write hooks use scaffold wrappers |
| SE2 Branding — Tab title | ❌ FAIL | `layout.tsx` title is "Scaffold-ETH 2 App"; template appends "| Scaffold-ETH 2" |
| SE2 Branding — Footer | ❌ FAIL | "Fork me" link, BuidlGuidl link still present |
| SE2 Branding — Header | ❌ FAIL | Shows "Scaffold-ETH / Ethereum dev stack" in logo area |
| SE2 Branding — README | ✅ PASS | README describes ClawdViction fully, not the SE2 template |
| SE2 Branding — Favicon | ✅ PASS | `/public/favicon.png` exists (custom PNG, not SE2 SVG) |
| Contract Address Display | ✅ PASS | Stake page renders `<Address address={stakingContractData.address} />` |
| USD Values on token amounts | ❌ FAIL | No USD conversion shown for CLAWD balances |
| OG Image — Absolute URL | ✅ PASS | `getMetadata.ts` builds `imageUrl = ${baseUrl}${imageRelativePath}` — absolute URL via `VERCEL_PROJECT_PRODUCTION_URL` in production |
| OG Thumbnail exists | ✅ PASS | `/public/thumbnail.jpg` present |
| Polling Interval | ✅ PASS | `pollingInterval: 3000` in `scaffold.config.ts` |
| Alchemy API Key via env var | ⚠️ PARTIAL | `alchemyApiKey` uses env var, but `rpcOverrides` hardcodes the key |
| Hardcoded RPC key in rpcOverrides | ❌ FAIL | `8GVG8WjDs-sGFRr6Rm839` exposed in plaintext |
| Dark Mode — No hardcoded dark backgrounds | ✅ PASS | No `bg-black`, `bg-zinc-9*`, etc. found in `app/` |
| DaisyUI semantic vars used | ✅ PASS | Uses `bg-base-100`, `bg-base-200`, `text-base-content` throughout |
| Phantom Wallet in RainbowKit | ❌ FAIL | Not in `wagmiConnectors.tsx` wallet list |
| Mobile Deep Linking | ❌ FAIL | No writeAndOpen / deep-link pattern implemented |

---

## Recommendations

**Priority 1 — Ship-Blockers (fix before any public launch):**

1. **Fix layout.tsx title + description** → "ClawdViction" / project description
2. **Fix getMetadata.ts title template** → `"%s | ClawdViction"`
3. **Remove Footer SE2 links** → replace with ClawdViction GitHub/Twitter links
4. **Fix Header branding** → replace SE2 logo/text with ClawdViction name + crab logo
5. **Move rpcOverrides to use env var** → don't hardcode Alchemy key in source

**Priority 2 — Should fix before marketing push:**

6. **Add Phantom wallet** to wagmiConnectors.tsx wallets array
7. **Fix inner page connect flow** → button-first, text-secondary or text below button
8. **Add CLAWD USD value** → integrate price feed, show `~$X.XX` next to CLAWD amounts
9. **Implement writeAndOpen deep-link** → mobile UX essential for WalletConnect users

**Priority 3 — Nice-to-have:**

10. Consider removing or hiding the `/debug` and `/blockexplorer` routes for production — they're dev tools and expose contract internals to end users
11. The WalletConnect appName in wagmiConnectors.tsx is still `"scaffold-eth-2"` — change to `"clawdviction"` for correct app labeling in wallet UIs
