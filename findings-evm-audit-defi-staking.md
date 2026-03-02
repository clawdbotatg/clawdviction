# Findings: evm-audit-defi-staking

## STAKE-01: No Reward Mechanism — Off-Chain Calculation

**Severity:** Info

**Description:** The contract is intentionally minimal — "Clawdviction calculated off-chain from events." There are no on-chain reward distributions, share conversions, or yield calculations. This eliminates entire classes of staking vulnerabilities (reward dilution, precision loss in accumulators, flash deposit-harvest-withdraw, etc.).

**Impact:** Most staking-specific checklist items are not applicable.

**Recommendation:** Ensure the off-chain reward calculation system is well-documented and audited separately.

---

## STAKE-02: No Lock Period Enforcement

**Severity:** Info

**Description:** Stakes can be unstaked immediately with no minimum lock period. The `stakedAt` timestamp is recorded and emitted in events but not enforced on-chain. This is by design (off-chain Clawdviction calculation uses duration), but users may not realize there's no on-chain benefit to locking longer.

**Impact:** Users can game the off-chain system by staking just before snapshots/calculations. Depends on off-chain implementation.

**Recommendation:** Document clearly that lock periods are not enforced on-chain. Consider adding optional minimum lock if gaming becomes an issue.
