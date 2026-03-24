# ClawdVictionStaking.sol — Audit Report

**Date**: 2026-03-24  
**Auditor**: Service PM (LeftClaw Services Worker Bot)  
**Repo**: https://github.com/clawdbotatg/clawdviction  
**Contract**: `packages/foundry/contracts/ClawdVictionStaking.sol` (96 lines)  
**Chain**: Base  

---

## Summary

The ClawdVictionStaking contract is a simple ERC20 staking contract where users stake CLAWD tokens and accumulate "clawdviction" — a time-weighted staking metric calculated on-chain and intended for off-chain settlement.

**2 Medium findings, 3 Low findings, 1 Info finding.**

---

## Contract Overview

```
stake(uint256 amount)         — stake CLAWD, minimum MIN_STAKE (1000e18)
unstake(uint256 stakeIndex)   — unstake, clawdviction credited to account
getClawdviction(address user) — view: clawdviction accrued
getActiveStakes(address user) — view: all active (non-zero) stakes
```

No owner, no pause, no access control. Fully permissionless. Uses SafeERC20.

---

## Findings

### [Medium] Clawdviction accrued on-chain but can never be claimed

**Contract**: `unstake()`, line ~28  
**See**: [Issue #20](https://github.com/clawdbotatg/clawdviction/issues/20)

The contract computes `clawdviction = amount * (block.timestamp - stakedAt)` and adds it to `clawdvictionAccrued[user]` on every `unstake()` call. However, **there is no function that reads or transfers this accumulated value**. The clawdviction is permanently stranded on-chain.

The contract natspec says clawdviction is "calculated off-chain from events," meaning the intent is for off-chain settlement code to read `Staked`/`Unstaked` events and compute independently. The on-chain `clawdvictionAccrued` accumulation serves no functional purpose and will diverge from off-chain calculations as users stake/unstake multiple times.

**Impact**: If off-chain clawdviction settlement uses the on-chain `clawdvictionAccrued` value, users will receive less than they should. If off-chain uses its own calculation, the on-chain value is dead code.

**Fix**: Either add `claimClawdviction()` to transfer tokens, or remove on-chain clawdviction tracking if it's purely off-chain.

---

### [Medium] Unbounded loop in getActiveStakes — DoS risk for large stakers

**Contract**: `getActiveStakes()`, line ~42  
**See**: [Issue #21](https://github.com/clawdbotatg/clawdviction/issues/21)

The function iterates over the ENTIRE `stakes[user]` array (including zeroed-out entries from past unstakes) to count active stakes, then iterates again to build output arrays. Since `stake()` only appends and never compacts, the array grows without bound.

A user with >~5,000 historical stakes will cause `getActiveStakes()` to exceed the block gas limit (~30M gas), permanently preventing on-chain reads of that user's stake data.

**Impact**: Large stakers (or griefers who stake/unstake many times) cannot read their data through the contract. Dependence on external indexers becomes mandatory.

**Fix**: Add a function to remove/compact zero entries, or track `activeStakeCount` separately so the loop only iterates active entries.

---

### [Low] Floating pragma `^0.8.20` allows mismatched compiler versions

**Contract**: Line 2

The floating pragma resolves to whatever compiler version is available at compile time. Different 0.8.x patch versions produce different bytecode due to optimizer changes, making bytecode verification unreliable.

**Fix**: Pin to exact version: `pragma solidity 0.8.20;`

---

### [Low] `block.timestamp` used as multiplier in clawdviction math — latent overflow

**Contracts**: `unstake()` line ~30, `getClawdviction()` line ~38

`amount * block.timestamp` and `amount * (block.timestamp - stakedAt)` both use `block.timestamp` as a multiplier. While `block.timestamp` won't realistically overflow uint256 in any foreseeable timeframe, the intermediate products produce values in "token-seconds" — an abstract unit requiring off-chain division by a constant to produce a real token amount.

Practically not exploitable today. Flagged for completeness.

**Fix**: Document the units and expected value ranges. Add bounds check on `block.timestamp` if the contract is expected to live >100 years.

---

### [Low] No pause / emergency stop mechanism

**Contract**: Entire contract

If a critical bug is found (in CLAWD token or off-chain settlement), there is no way to halt staking/unstaking. For a fully permissionless staking contract this may be intentional, but if the contract holds significant user funds, an emergency freeze option would reduce risk.

**Fix**: Add OpenZeppelin `Pausable` if emergency stop is desired. Document the intentional lack of admin if that is the design goal.

---

### [Info] No maximum stake cap

**Contract**: `stake()`

There is no cap on per-user or total stake. A single user could theoretically stake the entire CLAWD supply. No governance or economic implications for a pure staking contract, but worth documenting if a per-user cap is desired.

---

## Security Model Assessment

| Pattern | Status |
|---------|--------|
| CEI pattern in `unstake()` | ✅ Correctly implemented |
| ReentrancyGuard | N/A — CEI sufficient for standard ERC20 |
| SafeERC20 | ✅ Used throughout |
| Solidity 0.8.x overflow protection | ✅ Built-in |
| Access control | N/A — fully permissionless |
| Pause mechanism | ❌ None (by design?) |
| Unbounded storage growth | ⚠️ Stakes array never compacted |
| Off-chain + on-chain state divergence | ⚠️ Clawdviction double-tracked |

---

## Conclusion

The contract is a minimal, correctly implemented staking contract for the happy path. The two Medium findings relate to design issues rather than exploitable vulnerabilities: (1) clawdviction accounting that can't be settled on-chain, and (2) unbounded storage growth that creates a DoS vector for large stakers.

The contract is safe to use for its intended purpose with the noted Low findings understood and accepted. The Medium findings should be addressed before the contract is used for meaningful value settlement.
