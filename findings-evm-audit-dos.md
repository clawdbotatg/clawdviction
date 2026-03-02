# Findings: evm-audit-dos

## DOS-01: Unbounded Stakes Array Growth

**Severity:** Medium

**Description:** The `stakes[user]` array grows with every `stake()` call and never shrinks. Unstaking sets `amount = 0` but does not remove the array element. Over time, a user (or attacker staking on their own behalf) can grow their stakes array indefinitely.

The `getActiveStakes()` view function iterates the entire array twice:
```solidity
for (uint256 i = 0; i < len; i++) {
    if (userStakes[i].amount > 0) count++;
}
// ... second loop
for (uint256 i = 0; i < len; i++) {
    if (userStakes[i].amount > 0) { ... }
}
```

**Impact:** 
- `getActiveStakes()` will eventually exceed the block gas limit for users with many historical stakes, making it uncallable. This primarily affects off-chain consumers (frontends, indexers) since it's a `view` function.
- Core functions (`stake`, `unstake`, `emergencyWithdraw`) are NOT affected — they operate by index, not iteration.
- On L2s with cheap gas, an attacker could grow their array cheaply (1000 CLAWD minimum per stake = 1000 × 1000e18 = 1M CLAWD to create 1000 entries, recoverable via unstaking).

**Proof of Concept:**
1. User stakes MIN_STAKE (1000 CLAWD) 1000 times → stakes array has 1000 entries
2. User unstakes all 1000 → array still has 1000 entries (all with amount=0)
3. `getActiveStakes()` iterates 1000 entries twice, consuming increasing gas
4. Repeat until gas limit reached

**Recommendation:** 
- Option A: Use a swap-and-pop pattern to remove unstaked entries (changes indices — may break off-chain indexing)
- Option B: Add pagination to `getActiveStakes()` (offset, limit parameters)
- Option C: Accept the limitation and document it; rely on events for off-chain indexing instead of the view function

---

## DOS-02: No External Calls in Loops

**Severity:** Info

**Description:** The contract's loops (in `getActiveStakes`) contain only storage reads, no external calls. Core state-modifying functions operate on single indices. This is a good design pattern.

**Impact:** None.

**Recommendation:** No action needed.
