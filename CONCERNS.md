# Security Concerns & Attack Surface

Last updated: 2026-03-05

This document captures known security concerns, mitigated issues, and ongoing watch items for ClawdViction.

---

## Public Attack Surface

### Unauthenticated endpoints (no wallet required)
| Endpoint | Risk |
|----------|------|
| `GET /api/clawdviction/[wallet]` | Read-only, low risk |
| `GET /api/gov` | Read-only, low risk |
| `GET /api/gov/[id]` | Read-only, low risk |
| `GET /api/greet/[wallet]` | Read-only, low risk |
| `POST /api/onboard/[wallet]` | **Seeds DB for any wallet** — anyone can create a DB row. Low impact (no funds at risk) but unbounded. |

### Auth-gated endpoints (`verifyAuth` required)
All POST endpoints that modify state require a valid SIWE-style signed message. The signature must:
- Match the expected message format
- Be signed by the wallet in the URL/body
- Be within a 7-day validity window (see concern #4 below)

---

## Open Issues

### 🔴 #15 — DNS Rebinding Bypass on `fetch_url` SSRF Protection
**File:** `app/api/chat/route.ts`

The `fetch_url` tool validates the URL hostname against a string blocklist (localhost, private ranges, AWS metadata IP). This can be bypassed by DNS rebinding — an attacker registers a domain that initially resolves to a public IP (passes the check), then flips the DNS to point at `127.0.0.1` or `169.254.169.254`.

**Fix:** Add a post-DNS-resolution IP check using `dns.lookup()` before making the fetch.

→ [GitHub Issue #15](https://github.com/clawdbotatg/clawdviction/issues/15)

---

### 🟠 #16 — No Rate Limiting on Chat Endpoint
**File:** `app/api/chat/route.ts`

No per-wallet rate limiting. A whale with 20M+ CV (~2,000 messages worth) could burst-fire requests, causing Venice API cost spikes and triggering memory compression loops.

**Fix:** Sliding window rate limiter (10 req/min per wallet), checked before CV deduction.

→ [GitHub Issue #16](https://github.com/clawdbotatg/clawdviction/issues/16)

---

### 🟡 #17 — Venice Response Length Uncapped Before DB Insert
**File:** `app/api/chat/route.ts`

User input is character-limited but Venice AI responses are stored as-is. A prompt injection via `fetch_url` fetching malicious web content could cause inflated responses that bloat the DB and spike summarization costs.

**Fix:** Truncate `assistantMessage` to 4,000 chars before inserting.

→ [GitHub Issue #17](https://github.com/clawdbotatg/clawdviction/issues/17)

---

## Documented & Accepted Risks

### Auth Signature Replayable (7-day window)
Signed auth messages are valid for 7 days. If a signature is leaked, an attacker can use it to perform authed actions as that wallet for up to 7 days. Mitigated by the fact that signatures are wallet-specific (can't impersonate others) and CV costs gate every meaningful action.

**Decision:** Accept for now. Fix would require a used-signatures table in DB.

### Public Onboard Endpoint Seeds DB
`POST /api/onboard/[wallet]` is unauthenticated and will create a DB row for any wallet address. Low impact — no funds involved, just creates empty records. Intended behavior for bootstrapping new users.

**Decision:** Accept. Could add a simple proof-of-stake check later if abuse occurs.

---

## Already Fixed (audit completed 2026-03-05)

| Issue | Commit | Description |
|-------|--------|-------------|
| SSRF via `fetch_url` | `780c46e` | Block private IPs, metadata endpoints, validate protocol |
| CV deduction race condition | `bfe75c0` | Atomic UPDATE with WHERE balance >= threshold |
| Wallet case mismatch (all routes) | `f0300e6` | Normalize to lowercase at all API boundaries |
| Override with no stake check | `44f692c` | Require active stake to override governance vote |
| Annotate no length limit | `f0300e6` | Added max length validation |
| Cron accrue BigInt crash | `030ead2` | `Math.floor()` before BigInt cast on decimal balances |
| Governance wallet casing | `379a787` | DB migration + lowercase inserts + LOWER() WHERE clauses |
| Accounting drift (6 wallets) | DB direct | Synced `total_earned = balance + total_spent` |
| Decimal balances in DB | DB direct | Floored + added integer CHECK constraints |
| Silent zero on CV API error | `eb188ae` | Return `error: true` + HTTP 500, frontend handles it |
| Lowercase DB constraints | DB direct | `wallet = lower(wallet)` CHECK on all 5 tables |
| Message saved before CV check | `fd255b1` | Moved INSERT to after deduction succeeds |
| DDL on every request | `7d7a54d` | Moved all ALTER TABLE into `initDb()` |

---

## What to Watch in Production

- **Sudden CV drain on a single wallet** — could indicate a timing exploit
- **Burst of chat messages from one wallet** — no rate limit yet (see #16)
- **DB constraint violations in Vercel logs** — our lowercase + integer constraints will fire on bad inserts; these should not be silently swallowed
- **governance_queue depth** — if the queue processor fails, queue fills silently; add an alert if pending > 50
- **Venice API cost spikes** — unexpected surges likely indicate burst abuse or an unusually long response loop
