// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// WARNING: FOR TESTING ONLY — DO NOT DEPLOY TO MAINNET
// This contract has an unrestricted public mint function (faucet) and is
// intended exclusively for local development and testnet use.

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title Mock CLAWD Token
/// @notice FOR TESTING ONLY — Simple ERC-20 with a public faucet for local/testnet use
contract MockCLAWD is ERC20 {
    constructor() ERC20("CLAWD", "CLAWD") {
        _mint(msg.sender, 1_000_000_000 * 10 ** 18); // 1B supply
    }

    /// @notice Faucet for testing — anyone can mint
    function faucet(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
