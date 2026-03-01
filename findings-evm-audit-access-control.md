# Findings: evm-audit-access-control

## AC-01: Single-Step Ownership Transfer

**Severity:** Low

**Description:** The contract inherits OpenZeppelin's `Ownable` which provides single-step `transferOwnership()`. If ownership is transferred to an incorrect address, it is irrecoverably lost. This would prevent enabling emergency mode in the future.

**Impact:** Permanent loss of admin capabilities if ownership is transferred to a wrong address.

**Recommendation:** Use `Ownable2Step` instead of `Ownable` to require the new owner to accept the transfer.

---

## AC-02: Emergency Mode Cannot Be Disabled

**Severity:** Medium

**Description:** The `enableEmergencyMode()` function sets `emergencyMode = true` permanently. There is no corresponding `disableEmergencyMode()` function. Once activated, staking is permanently disabled — the contract can only process withdrawals.

```solidity
function enableEmergencyMode() external onlyOwner {
    emergencyMode = true;
    emit EmergencyModeEnabled();
}
```

**Impact:** If emergency mode is activated by mistake or after a temporary issue is resolved, the contract must be redeployed and all users must migrate. This could be intentional (one-way safety switch) but limits operational flexibility.

**Proof of Concept:**
1. Owner calls `enableEmergencyMode()`
2. Issue is resolved
3. No way to re-enable staking — contract is permanently in withdrawal-only mode

**Recommendation:** Either (a) add a `disableEmergencyMode()` function with appropriate safeguards (e.g., timelock), or (b) clearly document this as an intentional one-way safety mechanism.

---

## AC-03: Owner Can Renounce Ownership

**Severity:** Low

**Description:** `Ownable` exposes `renounceOwnership()`. If called, the owner is set to `address(0)`, permanently preventing `enableEmergencyMode()` from being called.

**Impact:** Loss of emergency mode capability. Does not affect existing user funds (unstake still works).

**Recommendation:** Override `renounceOwnership()` to revert, or document the risk.

---

## AC-04: No Timelock on Emergency Mode

**Severity:** Info

**Description:** Emergency mode is instantly activated without timelock or multi-sig requirement. A compromised owner key can immediately halt all new staking.

**Impact:** Compromised owner can prevent new stakes but cannot steal funds (no admin withdrawal function exists).

**Recommendation:** Consider multi-sig or timelock for emergency mode activation in production.
