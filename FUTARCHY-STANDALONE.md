# Futarchy: Standalone Implementation

A self-contained futarchy system — prediction markets for governance decisions, settled in $CLAWD, with onchain price resolution.

This document describes the architecture for a standalone futarchy deployment that can operate independently of any existing governance system.

---

## Overview

Every governance proposal creates two conditional prediction pools:

- **YES pool** — stake CLAWD here if you believe this proposal will improve the protocol health metric
- **NO pool** — stake CLAWD here if you believe it won't

After a resolution window, the protocol health metric is read onchain. The winning pool splits the losing pool. The market decided — no admin, no vote count.

---

## Contract: `FutarchyMarket.sol`

A factory that creates and manages individual markets per proposal.

```solidity
struct Market {
    uint256 id;
    string title;
    string question;
    address token;           // $CLAWD
    uint256 yesPool;
    uint256 noPool;
    uint256 openedAt;
    uint256 resolutionTime;  // unix timestamp when market resolves
    ResolutionMetric metric; // PRICE_24H | BURN_7D | STAKERS_7D
    bool resolved;
    bool outcome;            // true = YES won
    uint256 snapshotValue;   // metric value at market open
    uint256 resolvedValue;   // metric value at resolution
}

mapping(uint256 => Market) public markets;
mapping(uint256 => mapping(address => uint256)) public yesBets;
mapping(uint256 => mapping(address => uint256)) public noBets;
```

**Core functions:**

```solidity
function createMarket(
    string calldata title,
    string calldata question,
    ResolutionMetric metric,
    uint256 durationSeconds
) external onlyAdmin returns (uint256 marketId)

function betYes(uint256 marketId, uint256 amount) external
function betNo(uint256 marketId, uint256 amount) external

function resolve(uint256 marketId) external  // reads oracle, settles market
function claim(uint256 marketId) external    // winners pull winnings
```

**Resolution:**

```solidity
function resolve(uint256 marketId) external {
    Market storage m = markets[marketId];
    require(block.timestamp >= m.resolutionTime, "Too early");
    require(!m.resolved, "Already resolved");

    uint256 currentValue = readMetric(m.metric);
    m.outcome = currentValue > m.snapshotValue;
    m.resolvedValue = currentValue;
    m.resolved = true;

    emit MarketResolved(marketId, m.outcome, m.snapshotValue, currentValue);
}
```

---

## Resolution Metrics

### Price (TWAP from Uniswap V3)

Read `slot0.sqrtPriceX96` from the CLAWD/WETH pool on Base and compute spot price. Compare against snapshot taken at market open.

```solidity
function readPrice() internal view returns (uint256) {
    (uint160 sqrtPriceX96,,,,,,) = IUniswapV3Pool(CLAWD_WETH_POOL).slot0();
    return uint256(sqrtPriceX96) * uint256(sqrtPriceX96) / (2**192);
}
```

Resolution windows: **1h, 8h, 24h** — chosen at market creation.

### Burn (CLAWD at dead address)

```solidity
function readBurn() internal view returns (uint256) {
    return IERC20(CLAWD_TOKEN).balanceOf(DEAD_ADDRESS);
}
```

### Active Stakers

Read `totalSupplyStaked` from `ClawdVictionStaking.sol`.

---

## Payout Mechanics

Winners split the losing pool proportionally to their bet size.

```solidity
function claim(uint256 marketId) external {
    Market storage m = markets[marketId];
    require(m.resolved, "Not resolved");

    uint256 userBet = m.outcome
        ? yesBets[marketId][msg.sender]
        : noBets[marketId][msg.sender];
    require(userBet > 0, "Nothing to claim");

    uint256 winningPool = m.outcome ? m.yesPool : m.noPool;
    uint256 losingPool  = m.outcome ? m.noPool  : m.yesPool;

    // Return stake + proportional share of losing pool
    uint256 winnings = userBet + (userBet * losingPool / winningPool);

    yesBets[marketId][msg.sender] = 0;
    noBets[marketId][msg.sender]  = 0;
    IERC20(m.token).safeTransfer(msg.sender, winnings);
}
```

---

## Frontend

### Market page: `/futarchy/[id]`

- YES pool size vs NO pool size with live probability bar
- Place bet — amount input, YES/NO toggle, approve + stake
- Your position (bet size, current PnL if resolved)
- Resolution metric, snapshot value, current value, countdown
- After resolution: outcome banner + claim button

### Market list: `/futarchy`

- All open markets sorted by total pool size
- Closed markets with outcomes
- Link from governance proposals to their futarchy market

---

## Deployment

1. Deploy `FutarchyMarket.sol` with CLAWD token address + admin address
2. Admin creates markets alongside governance proposals
3. Anyone bets during the open window
4. After `resolutionTime`, anyone calls `resolve()` — permissionless
5. Winners call `claim()`

---

## Limitations of This Standalone Approach

- Requires separate CLAWD deposit on top of existing staked CLAWD
- No connection to holder identity, conviction scores, or AI larvas
- Market liquidity depends on active participation
- Admin still needed for market creation (Phase 1)

For a system deeply integrated with $CLAWD holder identity and AI-mediated participation, see `FUTARCHY-CLAWDVICTION.md`.
