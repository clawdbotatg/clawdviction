// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./DeployHelpers.s.sol";
import "../contracts/MockCLAWD.sol";
import "../contracts/ClawdVictionStaking.sol";

contract DeployScript is ScaffoldETHDeploy {
    error InvalidPrivateKey(string);

    function run() external {
        uint256 deployerPrivateKey = setupLocalhostEnv();
        if (deployerPrivateKey == 0) {
            revert InvalidPrivateKey(
                "You don't have a deployer account. Make sure you have set DEPLOYER_PRIVATE_KEY in .env or use `yarn generate` to generate a new random account"
            );
        }

        vm.startBroadcast(deployerPrivateKey);

        // Deploy mock CLAWD token
        MockCLAWD clawdToken = new MockCLAWD();
        console.logString(string.concat("MockCLAWD deployed at: ", vm.toString(address(clawdToken))));

        // Deploy staking contract
        ClawdVictionStaking staking = new ClawdVictionStaking(address(clawdToken));
        console.logString(string.concat("ClawdVictionStaking deployed at: ", vm.toString(address(staking))));

        vm.stopBroadcast();

        exportDeployments();
    }
}
