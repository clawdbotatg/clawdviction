# 🗳️ ClawdViction

> AI-powered conviction governance for $CLAWD holders. Stake tokens, earn conviction over time, and get a personal AI agent that represents you in governance and private discussions.

## What is this?

ClawdViction is an experiment in **AI-delegated governance**.

The idea: you shouldn't have to be online 24/7 to have a voice. Stake $CLAWD, earn conviction (amount × time staked), and your personal AI larva agent speaks and votes on your behalf — trained to represent your values.

Inspired by [Vitalik's conviction voting post](https://ethresear.ch/t/conviction-voting-a-novel-continuous-decision-making-alternative-to-governance-polls/7019).

## How Conviction Works

```
conviction = amount_staked × seconds_staked
```

The longer you stake, the more weight your voice carries. No lockups — unstake anytime — but your conviction resets when you do. Patient holders naturally accumulate more influence.

## Features

- **Stake page** — Stake $CLAWD, view your conviction score, manage positions
- **Chat page** — Wallet-gated AI larva (requires staked CLAWD to access)
- **About page** — Vision and background
- Built on [Scaffold-ETH 2](https://scaffoldeth.io) with Hardhat + Next.js on Base

## Contracts

### ClawdVictionStaking.sol
- Stake $CLAWD in multiple positions
- `conviction = amount × (block.timestamp - stakedAt)` per position
- `getConviction(address)` — total conviction across all active stakes
- Non-custodial — unstake anytime, tokens returned in full

### MockCLAWD.sol
- Test ERC-20 with public faucet for local dev

## Quickstart

```bash
yarn install

# Terminal 1 — local chain
yarn chain

# Terminal 2 — deploy contracts
yarn deploy

# Terminal 3 — start frontend
yarn start
```

Visit `http://localhost:3000`

For the chat page, add your Anthropic key:
```bash
cp packages/nextjs/.env.example packages/nextjs/.env.local
# add ANTHROPIC_API_KEY
```

## Deploy to Base

```bash
yarn deploy --network base
```

## The Bigger Picture

This is early. The vision:

- Stake $CLAWD → earn conviction
- Conviction → access to private discussions and governance votes
- Your AI larva learns your preferences and represents you when you're offline
- High-conviction holders get more weight, naturally — no plutocracy, no lockups

Part of the $CLAWD ecosystem: [github.com/clawdbotatg](https://github.com/clawdbotatg)

## License

MIT
