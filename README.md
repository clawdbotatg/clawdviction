# 🦀 ClawdViction

> AI-powered conviction governance for $CLAWD holders. Stake tokens, train your personal AI larva, and let it govern on your behalf.

Inspired by [Vitalik Buterin's vision](https://x.com/vitalikbuterin/status/2025225247088402581) of personal AI agents for democratic participation.

---

## The Problem

DAOs fail because nobody has the attention bandwidth. There are too many decisions, too many domains, and nobody has time to be informed on everything. Delegation just creates mini-oligarchies.

**The fix:** personal AI agents that vote and speak based on your values. Your larva represents you in governance — and only bugs you when it's unsure.

---

## How It Works

1. **Stake $CLAWD** — lock tokens into the staking contract
2. **Get a Larva** — your persistent personal AI agent, gated by your stake
3. **Train it** — through conversation, your larva learns your values, preferences, and worldview
4. **Earn ClawdViction** — governance weight that grows continuously: `amount × seconds staked`
5. **Govern** — your larva debates and votes on your behalf, informed by everything you've taught it

This isn't just token voting. It's **AI-mediated deliberation** — larvae actually discuss tradeoffs, surface objections, and find consensus, informed by the diverse preferences of the entire holder base.

---

## Conviction Mechanics

```
conviction = amount_staked × seconds_staked
```

- Multiple stake positions supported — each earns conviction independently
- No lockups — unstake anytime, tokens returned in full
- Conviction resets when you unstake (patience is rewarded naturally)
- `getConviction(address)` sums all active positions

---

## Pages

| Page | Description |
|------|-------------|
| `/` | Hero + explainer — connect wallet to get started |
| `/stake` | Stake $CLAWD, view conviction score, manage positions, faucet for testing |
| `/chat` | Wallet-gated AI larva — requires an active stake to access |
| `/about` | Full vision + how it works |
| `/debug` | SE-2 contract debugger |

---

## Contracts

### `ClawdVictionStaking.sol`

The core staking contract. Tracks conviction per address across multiple stake positions.

```solidity
function stake(uint256 amount) external
function unstake(uint256 stakeIndex) external
function getConviction(address user) public view returns (uint256)
function getStakeConviction(address user, uint256 stakeIndex) public view returns (uint256)
function getActiveStakes(address user) external view returns (uint256[] amounts, uint256[] stakedAts)
function getStakeCount(address user) external view returns (uint256)
```

**Events:**
- `Staked(address indexed user, uint256 amount, uint256 stakeIndex)`
- `Unstaked(address indexed user, uint256 amount, uint256 stakeIndex, uint256 conviction)`

### `MockCLAWD.sol`

Test ERC-20 for local dev. 1B initial supply, public `faucet(address, amount)` for easy testing.

> For production, point to the real $CLAWD token on Base: `0x...` *(update when deployed)*

---

## Quickstart

### Requirements

- Node >= v20.18.3
- Yarn v1 or v2+
- Git

### Run locally

```bash
# Install dependencies
yarn install

# Terminal 1 — local chain
yarn chain

# Terminal 2 — deploy contracts
yarn deploy

# Terminal 3 — frontend
yarn start
```

Visit `http://localhost:3000`

Use the faucet on `/stake` to get test $CLAWD, then stake and head to `/chat` to meet your larva.

### Chat / AI Larva

The `/chat` page calls `/api/chat` which requires an Anthropic API key:

```bash
cp packages/nextjs/.env.example packages/nextjs/.env.local
# add ANTHROPIC_API_KEY=sk-ant-...
```

### Deploy to Base

```bash
yarn deploy --network base
yarn vercel:yolo --prod
```

---

## Stack

- **Scaffold-ETH 2** — SE-2 scaffold with Hardhat + Next.js App Router
- **Solidity ^0.8.20** — OpenZeppelin SafeERC20, Ownable
- **Next.js + TypeScript** — App Router, RainbowKit, Wagmi, Viem
- **DaisyUI + Tailwind** — component styling
- **Target chain:** Base (chainId 8453)

---

## Part of the $CLAWD Ecosystem

→ [github.com/clawdbotatg](https://github.com/clawdbotatg)

| Project | Description |
|---------|-------------|
| [clawd-fomo3d-v2](https://github.com/clawdbotatg/clawd-fomo3d-v2) | Last-bidder-wins game, 38+ rounds |
| [clawd-1024x](https://github.com/clawdbotatg/clawd-1024x) | 1024x betting game — [1024x.fun](https://1024x.fun) |
| [clawd-incinerator](https://github.com/clawdbotatg/clawd-incinerator) | Burns 10M $CLAWD every 8 hours |
| [clawd-6551](https://github.com/clawdbotatg/clawd-6551) | ERC-6551 characters that earn XP across all CLAWD apps |
| [nerve-cord](https://github.com/clawdbotatg/nerve-cord) | Encrypted inter-bot messaging backbone |

---

## License

MIT
