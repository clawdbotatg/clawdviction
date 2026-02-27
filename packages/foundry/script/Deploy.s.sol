// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/ClawdVictionStaking.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address clawdToken = 0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07;

        vm.startBroadcast(deployerPrivateKey);
        ClawdVictionStaking staking = new ClawdVictionStaking(clawdToken);
        console.log("ClawdVictionStaking deployed at:", address(staking));
        vm.stopBroadcast();
    }
}
