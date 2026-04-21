# larv.ai CV API — SKILL.md

Use this skill when building apps that charge CV (clawdviction) or check CV balances via larv.ai.

## Base URL
```
https://larv.ai/api/cv
```

## Authentication

The **GET /balance** endpoint is public — no auth required.

The **POST /spend** endpoint requires:
1. Your builder **CV_SPEND_SECRET** — get this from the larv.ai team
2. The user's **wallet signature** — users sign `"larv.ai CV Spend"` with their wallet (supports both EOA and ERC-1271 smart contract wallets like Coinbase Smart Wallet)

---

## Endpoints

### `GET /api/cv/balance?address=0x...`

Check any wallet's CV balance.

**Request:**
```
GET https://larv.ai/api/cv/balance?address=0x7E6Db18aea6b54109f4E5F34242d4A8786E0C471
```

**Response (200):**
```json
{ "success": true, "balance": 19409885.0 }
```

**Error (wallet not found):**
```json
{ "success": false, "error": "wallet not found" }
```

---

### `POST /api/cv/spend`

Charge a wallet's CV balance. Requires wallet signature verification.

**Request:**
```
POST https://larv.ai/api/cv/spend
Content-Type: application/json
```

```json
{
  "wallet": "0x7E6Db18aea6b54109f4E5F34242d4A8786E0C471",
  "secret": "<your_cv_spend_secret>",
  "amount": 10000,
  "signature": "0x..."
}
```

**Fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `wallet` | string | Yes | Wallet address (hex) |
| `secret` | string | Yes | Your CV_SPEND_SECRET from larv.ai |
| `amount` | integer | Yes | CV units to charge (positive integer) |
| `signature` | string | Yes | Signature of `"larv.ai CV Spend"` from the wallet (EOA or ERC-1271 smart wallet) |

**Response (200 — success):**
```json
{ "success": true, "newBalance": 19409885.0 }
```

**Error (insufficient balance) — 402:**
```json
{ "success": false, "error": "insufficient balance", "balance": 5000.0 }
```

**Error (invalid secret) — 403:**
```json
{ "success": false, "error": "invalid secret" }
```

**Error (wallet not found) — 404:**
```json
{ "success": false, "error": "wallet not found" }
```

---

## Signature Generation

The wallet must sign the fixed message: `"larv.ai CV Spend"`

### ethers.js v6

```typescript
import { Wallet } from "ethers";

// Sign (client or server with private key)
const signer = new Wallet(privateKey);
const signature = await signer.signMessage("larv.ai CV Spend");

// On-chain verification (if needed — supports EOA + ERC-1271 smart wallets)
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
const publicClient = createPublicClient({ chain: base, transport: http() });
const valid = await publicClient.verifyMessage({
  address: walletAddress,
  message: "larv.ai CV Spend",
  signature,
});
```

### viem

```typescript
import { signMessage } from "viem";
const signature = await signMessage({
  account: privateKeyToAccount(privateKey),
  message: "larv.ai CV Spend",
});
```

### Frontend (wagmi + viem)

```typescript
import { signMessage } from "viem";
import { useAccount, useSignMessage } from "wagmi";

const { address } = useAccount();
const { signMessageAsync } = useSignMessage();

const signature = await signMessageAsync({
  message: "larv.ai CV Spend",
});
// Use `address` as the wallet field, `signature` as the signature field
```

---

## Example Code

### Check Balance (client or server)

```typescript
async function getCVBalance(address: string): Promise<number> {
  const res = await fetch(`https://larv.ai/api/cv/balance?address=${address}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.balance;
}

const balance = await getCVBalance("0x7E6Db18aea6b54109f4E5F34242d4A8786E0C471");
console.log(`Balance: ${balance.toLocaleString()} CV`);
```

### Charge CV (server-side only — never expose secret client-side)

```typescript
async function chargeCV(
  wallet: string,
  amount: number,
  signature: string,
  spendSecret: string
): Promise<{ success: boolean; newBalance?: number; error?: string }> {
  const res = await fetch("https://larv.ai/api/cv/spend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, amount, signature, secret: spendSecret }),
  });

  if (!res.ok) {
    const data = await res.json();
    return { success: false, error: data.error };
  }

  return res.json();
}

// Usage
const result = await chargeCV(
  "0x7E6Db18aea6b54109f4E5F34242d4A8786E0C471",
  10000,
  userSignature,
  process.env.CV_SPEND_SECRET
);

if (result.success) {
  console.log(`Charged! New balance: ${result.newBalance}`);
} else {
  console.error(`Failed: ${result.error}`);
}
```

---

## Important Notes

- **CV is dimensionless** — governance score, not a token. 1 unit = 1 CV.
- **Balances are floats** — no decimal conversion needed.
- **Spend is atomic** — balance check + deduction in one DB transaction. No race conditions.
- **Never expose the secret client-side** — call /spend from your backend server. The example above shows the correct pattern.
- **GET /balance has open CORS** — safe for client-side calls.
- **POST /spend requires wallet signature** — users must sign with their own wallet. You cannot charge a wallet without their signature.
- **Smart wallet support** — Coinbase Smart Wallet and other ERC-1271 wallets are fully supported. Signature verification works for both EOA and smart contract wallets.
