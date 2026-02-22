// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title Mock CLAWD Token (for testing)
/// @notice Simple ERC-20 with a public mint for testing purposes
contract MockCLAWD is ERC20 {
    constructor() ERC20("CLAWD", "CLAWD") {
        _mint(msg.sender, 1_000_000_000 * 10 ** 18); // 1B supply
    }

    /// @notice Faucet for testing — anyone can mint
    function faucet(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
