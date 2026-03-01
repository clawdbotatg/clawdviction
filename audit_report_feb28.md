# ClawdViction Staking Contract — Security Audit Report

**Date:** February 28, 2026  
**Auditor:** ClawdBot Automated Security Audit  
**Methodology:** [EVM Audit Skills](https://github.com/austintgriffith/evm-audit-skills) (6-skill deep audit)

---

## Executive Summary

The ClawdVictionStaking contract is a minimal staking mechanism for the CLAWD ERC20 token. Users stake tokens, and "Clawdviction" scores are calculated off-chain from emitted events. The contract is intentionally simple — no on-chain rewards, no share tokens, no complex math.

**Overall Assessment: Low Risk.** The contract follows good security practices (SafeERC20, CEI pattern, immutable token address). No critical or high-severity vulnerabilities were found. Two medium-severity findings relate to operational concerns (irreversible emergency mode, unbounded array growth in view function). Several low/informational findings are noted for hardening.

---

## Scope

| Item | Detail |
|------|--------|
| **Contract** | `ClawdVictionStaking.sol` |
| **File Path** | `packages/foundry/contracts/ClawdVictionStaking.sol` |
| **Commit** | `78b496410e4a2f6e29e86f6fdd5722ef9098c5ff` |
| **Solidity** | ^0.8.20 |
| **Dependencies** | OpenZeppelin Contracts (IERC20, SafeERC20, Ownable) |
| **Context File** | `MockCLAWD.sol` (test token) |

---

## Methodology

Six specialist audit checklists from the [evm-audit-skills](https://github.com/austintgriffith/evm-audit-skills) framework were applied:

1. **evm-audit-general** — Cross-cutting (reentrancy, force-feeding, low-level calls, pause patterns)
2. **evm-audit-precision-math** — Division ordering, rounding, overflow, decimal handling
3. **evm-audit-erc20** — Fee-on-transfer, rebasing, approval edge cases, weird tokens
4. **evm-audit-defi-staking** — Reward calculations, lock mechanisms, LSD integration, flash attacks
5. **evm-audit-access-control** — Centralization, privilege escalation, ownership, initialization
6. **evm-audit-dos** — Gas griefing, unbounded loops, revert-based DoS, pause DoS

Every checklist item was evaluated against the contract. Findings are documented with accurate severity.

---

## Findings Summary

| ID | Title | Severity | Status |
|----|-------|----------|--------|
| AC-02 | Emergency Mode Cannot Be Disabled | Medium | Open |
| DOS-01 | Unbounded Stakes Array Growth | Medium | Open |
| AC-01 | Single-Step Ownership Transfer | Low | Open |
| AC-03 | Owner Can Renounce Ownership | Low | Open |
| ERC20-01 | Fee-on-Transfer Token Incompatibility | Low | Open |
| AC-04 | No Timelock on Emergency Mode | Info | Open |
| G-01 | No Reentrancy Guard (CEI Pattern Followed) | Info | Open |
| G-02 | No Force-Feed Risk | Info | Open |
| PM-01 | No Precision/Math Issues | Info | Open |
| ERC20-02 | SafeERC20 Correctly Used | Info | Open |
| STAKE-01 | No Reward Mechanism (Off-Chain) | Info | Open |
| STAKE-02 | No Lock Period Enforcement | Info | Open |
| DOS-02 | No External Calls in Loops | Info | Open |

**Critical: 0 | High: 0 | Medium: 2 | Low: 3 | Info: 8**

---

## Detailed Findings

### AC-02: Emergency Mode Cannot Be Disabled

**Severity:** Medium  
**Category:** Access Control

**Description:** The `enableEmergencyMode()` function sets `emergencyMode = true` permanently. There is no `disableEmergencyMode()` function. Once activated, staking is permanently disabled.

**Impact:** If emergency mode is activated by mistake or after a temporary issue is resolved, the contract must be redeployed and all users must migrate.

**Proof of Concept:**
1. Owner calls `enableEmergencyMode()`
2. Issue is resolved
3. No way to resume staking — contract is permanently in withdrawal-only mode

**Recommendation:** Add a `disableEmergencyMode()` function with safeguards (e.g., timelock), or document this as an intentional one-way safety mechanism.

---

### DOS-01: Unbounded Stakes Array Growth

**Severity:** Medium  
**Category:** Denial of Service

**Description:** The `stakes[user]` array grows with every `stake()` call and never shrinks. Unstaking sets `amount = 0` but does not remove the element. The `getActiveStakes()` view function iterates the entire array twice.

**Impact:** `getActiveStakes()` becomes uncallable (exceeds gas limit) for users with many historical stakes. Core functions (`stake`, `unstake`, `emergencyWithdraw`) are NOT affected as they operate by index. On L2s with cheap gas, array growth is economically cheaper.

**Proof of Concept:**
1. Stake MIN_STAKE 1000 times → array has 1000 entries
2. Unstake all → array still has 1000 zero-amount entries
3. `getActiveStakes()` iterates 2000 times, consuming increasing gas
4. Eventually exceeds block gas limit

**Recommendation:** Add pagination to `getActiveStakes()` (offset/limit parameters), or document that off-chain indexing via events should be used instead.

---

### AC-01: Single-Step Ownership Transfer

**Severity:** Low  
**Category:** Access Control

**Description:** Uses `Ownable` instead of `Ownable2Step`. Transferring ownership to an incorrect address is irrecoverable.

**Impact:** Permanent loss of admin capabilities (emergency mode activation).

**Recommendation:** Use `Ownable2Step` to require the new owner to accept the transfer.

---

### AC-03: Owner Can Renounce Ownership

**Severity:** Low  
**Category:** Access Control

**Description:** `Ownable` exposes `renounceOwnership()`. If called, `enableEmergencyMode()` becomes permanently uncallable.

**Impact:** Loss of emergency mode capability. Does not affect existing user funds.

**Recommendation:** Override `renounceOwnership()` to revert.

---

### ERC20-01: Fee-on-Transfer Token Incompatibility

**Severity:** Low  
**Category:** ERC20 Integration

**Description:** `stake()` records the `amount` parameter directly without measuring actual tokens received. If `clawdToken` were fee-on-transfer, accounting would be inflated.

**Impact:** Not exploitable with standard CLAWD token. Only relevant if contract is reused with exotic tokens.

**Recommendation:** Document the standard ERC20 assumption. For reuse, measure `balanceAfter - balanceBefore`.

---

## Positive Findings

- ✅ **SafeERC20** used for all token interactions
- ✅ **CEI pattern** correctly followed in `unstake()` and `emergencyWithdraw()`
- ✅ **Immutable token address** prevents token swap attacks
- ✅ **Internal accounting** (not `balanceOf`) prevents direct-transfer manipulation
- ✅ **No complex math** eliminates precision/rounding attack surface
- ✅ **Minimal design** significantly reduces attack surface
- ✅ **Events emitted** for all state changes

---

## Conclusion

The ClawdVictionStaking contract is well-designed for its intended purpose as a minimal staking mechanism. The deliberate simplicity (no on-chain rewards, no shares, no complex math) eliminates most DeFi attack vectors. The two medium findings (irreversible emergency mode, unbounded array in view function) are operational concerns rather than fund-loss vulnerabilities. The low findings are standard hardening recommendations. No user funds are at risk from any discovered issue.
