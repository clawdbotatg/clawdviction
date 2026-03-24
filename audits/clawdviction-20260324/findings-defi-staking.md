# Findings: ClawdVictionStaking.sol

## [S-01] Clawdviction is tracked on-chain but can never be claimed

**Severity**: Medium  
**Category**: evm-audit-defi-staking  
**Location**: `unstake()` line ~28, `getClawdviction()` line ~37

**Description**:  
The contract computes and accumulates `clawdviction` in `clawdvictionAccrued[user]` on every `unstake()` call. However, there is no function that reads `clawdvictionAccrued` or `getClawdviction()` to transfer tokens to the user. The accumulated clawdviction grows indefinitely and is permanently stranded.

The contract comment says "Clawdviction calculated off-chain from events" — meaning off-chain code is expected to read events and compute clawdviction independently. The on-chain `clawdvictionAccrued` accumulation serves no on-chain purpose and will diverge from off-chain calculations as users stake/unstake multiple times.

**Proof of Concept**:  
1. Alice stakes 1000 CLAWD via `stake()`
2. Time passes
3. Alice calls `unstake(0)` — `clawdviction` is computed and added to `clawdvictionAccrued[Alice]`
4. Alice's `clawdvictionAccrued` is now some positive number but can never be redeemed
5. Off-chain code calculates a different value based on event interpretation

**Recommendation**:  
Either (a) add a `claimClawdviction()` function that transfers the accumulated clawdviction tokens to the user, or (b) remove the on-chain clawdviction tracking entirely and rely solely on off-chain event-based calculation.

---

## [S-02] getActiveStakes() has an unbounded loop — DoS risk for large stakers

**Severity**: Medium  
**Category**: evm-audit-dos  
**Location**: `getActiveStakes()` line ~42

**Description**:  
The function iterates over ALL stakes (including fully unstaked/zero ones) to count active ones, then iterates again to populate arrays. If a user has thousands of stakes (which is possible since stakes are only appended, never deleted), this function will eventually exceed the block gas limit and revert, permanently preventing that user from reading their active stakes via the contract.

The `stakes[user].push()` in `stake()` means the array only grows. There is no mechanism to remove zero-amount entries.

**Proof of Concept**:  
1. Attacker (or any user) calls `stake(MIN_STAKE)` 5,000 times (costly but possible)
2. Each call appends a new Stake entry
3. `getActiveStakes(attacker)` iterates 5,000 entries, hitting block gas limit
4. User's front-end cannot read their active stakes; must use an external indexer

**Recommendation**:  
Add a `removeStakeEntry(uint256 stakeIndex)` function that zeros out the entry, or compact the array periodically. Alternatively, track `activeStakeCount` separately and skip zero entries more efficiently.

---

## [S-03] Floating pragma ^0.8.20 allows mismatched compiler versions

**Severity**: Low  
**Category**: evm-audit-general  
**Location**: Line 2 — `pragma solidity ^0.8.20;`

**Description**:  
The floating pragma `^0.8.20` resolves to the latest compiler in the 0.8.x range at compile time. While Solidity 0.8.x has built-in overflow protection, different patch versions (e.g., 0.8.20 vs 0.8.30) can produce different bytecode due to optimizer changes or Yul code generation differences. This makes bytecode verification against source code unreliable.

**Recommendation**:  
Pin to an exact compiler version: `pragma solidity 0.8.20;`

---

## [S-04] Clawdviction calculation uses block.timestamp as multiplier — potential overflow in extreme scenarios

**Severity**: Low  
**Category**: evm-audit-precision-math  
**Location**: `unstake()` line ~30, `getClawdviction()` line ~38

**Description**:  
`clawdviction = amount * (block.timestamp - stakedAt)` and `totalStaked[user] * block.timestamp` both use `block.timestamp` as a multiplier. While `block.timestamp` (as a uint256) won't realistically overflow in the foreseeable future (it would require block.timestamp to approach 2^256), the calculation produces a result in units of "token-seconds" — a value that has no relationship to any real token amount until divided by an off-chain constant.

If `amount` is large (e.g., 1e24 = 1M tokens with 18 decimals) and `block.timestamp` is large (e.g., 1e10 ≈ year 2287), the intermediate product exceeds uint256.max. This is not practically exploitable today but represents a latent risk.

**Recommendation**:  
Add a safety bound: `require(block.timestamp < SOME_REASONABLE_MAX)` or use SafeMath if the risk is deemed non-zero.

---

## [S-05] No pause / emergency stop mechanism

**Severity**: Low  
**Category**: evm-audit-access-control  
**Location**: Entire contract

**Description**:  
The contract has no pause functionality. In the event of a critical bug (e.g., in the CLAWD token, or in off-chain clawdviction settlement), there is no way to halt staking/unstaking to prevent further damage.

For a simple staking contract, this may be intentional. However, if the contract holds a meaningful amount of user funds and a token vulnerability is discovered, the owner has no ability to freeze operations.

**Recommendation**:  
Consider adding OpenZeppelin's `Pausable` if emergency stop functionality is desired. If this is intentional for a fully permissionless protocol, document this design decision in the contract natspec.

---

## [S-06] No maximum stake cap — no economic bound

**Severity**: Info  
**Category**: evm-audit-defi-staking  
**Location**: `stake()` line ~19

**Description**:  
There is no maximum stake per user or globally. A single user could stake the entire CLAWD supply. While this is likely intentional for a staking pool, it means there is no protection against a single entity acquiring a dominant position.

For a pure staking contract with no governance implications, this is acceptable.

---

## Summary Table

| ID  | Title | Severity |
|-----|-------|----------|
| S-01 | Clawdviction tracked on-chain but never claimable | Medium |
| S-02 | Unbounded loop in getActiveStakes — DoS risk | Medium |
| S-03 | Floating pragma allows mismatched compiler versions | Low |
| S-04 | block.timestamp as multiplier in clawdviction math | Low |
| S-05 | No pause/emergency stop mechanism | Low |
| S-06 | No maximum stake cap | Info |
