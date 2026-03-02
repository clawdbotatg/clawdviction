# Findings: evm-audit-general

## G-01: No Reentrancy Guard (Though CEI Pattern Followed)

**Severity:** Info

**Description:** The contract lacks an explicit `nonReentrant` modifier. However, the Checks-Effects-Interactions pattern is correctly followed in `unstake()` and `emergencyWithdraw()` — state (`s.amount = 0`, accounting decrements) is updated before the external `safeTransfer` call. The `stake()` function calls `safeTransferFrom` before updating state, but since it pulls tokens from the caller, reentrancy would only allow the caller to stake more of their own tokens (requiring additional approvals), which is not exploitable.

**Impact:** Minimal. CEI pattern provides adequate protection for the current contract.

**Recommendation:** Consider adding `ReentrancyGuard` as defense-in-depth for future modifications.

---

## G-02: No Force-Feed Risk

**Severity:** Info

**Description:** The contract does not use `address(this).balance` or depend on ETH balance for any logic. It tracks staked amounts via internal accounting (`totalStaked`, `totalSupplyStaked`), not `balanceOf`. Force-feeding ETH or direct token transfers do not affect contract logic.

**Impact:** None.

**Recommendation:** No action needed.
