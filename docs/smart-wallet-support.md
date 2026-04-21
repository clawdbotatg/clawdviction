# Smart Wallet Support (ERC-1271)

Larvai fully supports **Coinbase Smart Wallet** and any other **ERC-1271 compatible smart contract wallet** for authentication and CV spending.

---

## What This Means

Traditional wallets (MetaMask, Rabby, etc.) are **Externally Owned Accounts (EOAs)** — a private key signs messages directly, and anyone can verify the signature using `ecrecover`. Smart contract wallets (Coinbase Smart Wallet, Safe, Argent, etc.) don't have a private key at the contract level. Instead, they implement the **ERC-1271** standard: a `isValidSignature(bytes32, bytes)` function on the contract itself that returns whether a given signature is valid.

This means signature verification must go **on-chain** — the verifier calls the wallet contract to ask "is this signature valid?" rather than doing pure math locally.

---

## How It Works

Larvai uses viem's `publicClient.verifyMessage()` instead of the standalone `verifyMessage()` utility. The public client method:

1. **First tries `ecrecover`** — standard EOA verification (fast, no RPC call needed)
2. **If that fails, calls the contract's `isValidSignature()`** — ERC-1271 verification via an on-chain call to the wallet address

This is transparent to the user. Whether they connect with MetaMask or Coinbase Smart Wallet, the same signing flow works. No extra steps, no different UI.

---

## What Users See

**Nothing different.** Users connect their wallet (EOA or smart wallet), sign messages when prompted, and everything works. The verification happens server-side and handles both wallet types automatically.

Supported wallet types:
- **EOA wallets** — MetaMask, Rabby, Rainbow, Coinbase Wallet (EOA mode), hardware wallets, etc.
- **Coinbase Smart Wallet** — the default for new Coinbase Wallet users
- **Safe (formerly Gnosis Safe)** — multi-sig smart contract wallet
- **Any ERC-1271 wallet** — any contract that implements `isValidSignature`

---

## Where It's Used

ERC-1271 verification is used in two places:

### 1. Authentication (`verifyAuth.ts`)

Every authenticated API request (chat, onboarding, governance, forum, labs) verifies the wallet's signature of a timestamped message. This now works with smart wallets.

### 2. CV Spending (`/api/cv/spend`)

When external apps charge CV via the spend API, the wallet signature of `"larv.ai CV Spend"` is verified. Smart wallet signatures are now accepted.

---

## Technical Details

Both verification points create a viem `publicClient` connected to Base mainnet (via Alchemy) and call `publicClient.verifyMessage()`. Under the hood, viem:

1. Recovers the signer address from the signature using `ecrecover`
2. If the recovered address matches → valid (EOA path)
3. If not, calls `isValidSignature(bytes32,bytes)` on the address → checks for the ERC-1271 magic value `0x1626ba7e`

The on-chain call only happens for smart contract wallets, so there's no performance impact for EOA users.

---

## References

- [ERC-1271: Standard Signature Validation Method for Contracts](https://eips.ethereum.org/EIPS/eip-1271)
- [Coinbase Smart Wallet](https://www.coinbase.com/wallet/smart-wallet)
- [viem `publicClient.verifyMessage`](https://viem.sh/docs/actions/public/verifyMessage)
