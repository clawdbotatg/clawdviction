# Findings: evm-audit-erc20

## ERC20-01: Fee-on-Transfer Token Incompatibility

**Severity:** Low

**Description:** The `stake()` function records the `amount` parameter directly as the staked amount without measuring actual tokens received (`balanceAfter - balanceBefore`). If `clawdToken` were a fee-on-transfer token, internal accounting would be inflated relative to actual holdings.

```solidity
clawdToken.safeTransferFrom(msg.sender, address(this), amount);
stakes[msg.sender].push(Stake({ amount: amount, ... }));
totalStaked[msg.sender] += amount;
totalSupplyStaked += amount;
```

**Impact:** If a fee-on-transfer token is used, the contract would record more staked tokens than it holds, eventually making late unstakers unable to withdraw. However, the `clawdToken` is `immutable` and set at deployment — if the CLAWD token is a standard ERC20 (as MockCLAWD confirms), this is not exploitable.

**Recommendation:** Document the assumption that CLAWD is a standard ERC20. If the contract may be reused with other tokens, measure actual received amount via balance difference.

---

## ERC20-02: SafeERC20 Correctly Used

**Severity:** Info

**Description:** The contract properly uses OpenZeppelin's `SafeERC20` for all token interactions (`safeTransferFrom`, `safeTransfer`), handling non-standard return value tokens correctly.

**Impact:** None.

**Recommendation:** No action needed.
