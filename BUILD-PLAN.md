# ClawdViction Build Plan

## What We're Building
Full-stack conviction governance: stake $CLAWD → earn clawdviction (amount × time, stored in DB) → unlock chat → talk to your personal AI larva agent running in Docker.

## Architecture

```
Next.js Frontend ←→ Express Backend API ←→ SQLite DB (clawdviction scores, chat history)
                                        ←→ Docker (one larva container per wallet)
                                        ←→ Foundry local chain (Anvil)
```

## Stack
- **Chain:** Foundry/Anvil local chain (NOT Hardhat)
- **Contract:** ClawdVictionStaking.sol (already exists in packages/foundry/)
- **Frontend:** Next.js (already scaffolded in packages/nextjs/)
- **Backend:** Express + SQLite in packages/backend/
- **Larvae:** Docker containers, one per wallet, each running an openclaw-style AI agent
- **Token:** MockCLAWD with faucet for local testing

## Tasks

### 1. Rename "conviction" → "clawdviction" everywhere
- Contract: rename `getConviction()` → `getClawdviction()`, events, comments
- Frontend: all UI copy, variable names
- About page copy

### 2. Build backend (packages/backend/)
- Express server with these endpoints:
  - `GET /api/clawdviction/:wallet` — returns current clawdviction score from DB + live delta from active stakes
  - `POST /api/chat` — proxy messages to the wallet's larva container
  - `GET /api/larva/:wallet/status` — is the larva running?
  - `POST /api/larva/:wallet/launch` — spin up a larva container for this wallet
- Event indexer: poll Anvil chain for Staked/Unstaked events, update SQLite
- SQLite schema:
  - `stakes` table: wallet, amount, staked_at, unstaked_at
  - `clawdviction` table: wallet, accumulated_score (persists after unstake)
  - `chat_messages` table: wallet, role, content, timestamp

### 3. Clawdviction scoring
- clawdviction = sum of (amount × seconds_staked) for each stake position
- Accumulates in DB — does NOT reset when you unstake (you earned it, you keep it)
- Active stakes keep earning in real-time (backend calculates live delta)
- Frontend shows it ticking up every second via polling or computed client-side

### 4. Chat unlock threshold
- Threshold: 1,000,000 clawdviction (e.g. 1000 CLAWD staked for ~17 minutes, or 10000 CLAWD for ~100 seconds)
- Below threshold: show "Stake more $CLAWD to unlock your larva" with progress bar
- Above threshold: chat unlocks, can launch larva

### 5. Docker larva setup
- Dockerfile for a larva: lightweight Node.js container with an AI chat agent
- Each larva gets:
  - Its own container named `larva-{wallet_short}`
  - Persistent volume for memory/personality
  - Access to a simple chat API (stdin/stdout or HTTP)
- For local testing: use a simple echo bot or local LLM proxy initially
- Backend manages lifecycle: launch, health check, stop

### 6. Wire up frontend
- /stake page: 
  - Show clawdviction score ticking up in real-time
  - Rename all "conviction" → "clawdviction" in UI
  - Fix the approve flow (currently broken — needs staking contract address)
- /chat page:
  - Gate behind clawdviction threshold (read from backend, not just on-chain staking)
  - Show clawdviction progress bar if below threshold
  - Route messages through backend to larva container
- Landing page: explain the concept

### 7. Local dev setup (yarn commands)
- `yarn chain` — starts Anvil
- `yarn deploy` — deploys contracts to local Anvil
- `yarn backend` — starts the Express backend
- `yarn start` — starts Next.js frontend
- Everything works on localhost, this Mac mini is the "server"

## Key Decisions
- clawdviction is a NUMBER IN A DATABASE, not a token
- clawdviction persists after unstaking (you earned it)
- Each wallet gets ONE larva (Docker container)
- Chat only unlocks after hitting clawdviction threshold
- Foundry (Anvil) for local chain, NOT Hardhat

## ethskills.com Frontend UX Rules (MANDATORY)

Follow these patterns from https://ethskills.com/frontend-ux/SKILL.md:

### Every Onchain Button — Loader + Disable
ANY button that triggers a blockchain transaction MUST:
1. Disable immediately on click
2. Show a spinner ("Approving...", "Staking...", etc.)
3. Stay disabled until the state update confirms the action completed
4. Show success/error feedback when done
- Use SEPARATE loading state per button (never a single shared isLoading)

### Four-State Flow — Connect → Network → Approve → Action
Show exactly ONE big button at a time:
1. Not connected? → Big "Connect Wallet" button (NOT text saying "connect your wallet")
2. Wrong network? → Big "Switch Network" button
3. Not enough approved? → "Approve" button (with loader)
4. Enough approved? → "Stake" / action button

### Scaffold Hooks Only — Never Raw Wagmi
- Use `useScaffoldWriteContract` and `useScaffoldReadContract` — NOT raw wagmi hooks
- `useScaffoldWriteContract` waits for block confirmation, raw wagmi doesn't
- Use `<Address/>` component for addresses (ENS, blockie, explorer links)

### Token Approval Flow (CRITICAL for staking)
The approve + stake must be a proper two-step flow:
1. Read current allowance via `useScaffoldReadContract` on the CLAWD token
2. If allowance < stake amount, show "Approve" button first
3. After approval confirms, show "Stake" button
4. Each step has its own loading state and disables during tx

## ethskills.com Ship Guide
- This is a Scaffold-ETH 2 Foundry flavor project
- Use `yarn chain` for Anvil, `yarn deploy` for Foundry deploy scripts
- Deploy script is in packages/foundry/script/Deploy.s.sol
- Contracts in packages/foundry/contracts/
- Tests in packages/foundry/test/
- After deploy, ABIs auto-generate to packages/nextjs/contracts/deployedContracts.ts
