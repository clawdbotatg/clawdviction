// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/MockCLAWD.sol";
import "../contracts/ClawdVictionStaking.sol";

contract ClawdVictionStakingTest is Test {
    MockCLAWD public clawd;
    ClawdVictionStaking public staking;
    address public alice = makeAddr("alice");

    function setUp() public {
        clawd = new MockCLAWD();
        staking = new ClawdVictionStaking(address(clawd));
        
        // Give alice some tokens
        clawd.faucet(alice, 10_000 ether);
    }

    function test_Stake() public {
        vm.startPrank(alice);
        clawd.approve(address(staking), 1000 ether);
        staking.stake(1000 ether);
        vm.stopPrank();

        assertEq(staking.totalStaked(alice), 1000 ether);
        assertEq(staking.getStakeCount(alice), 1);
    }

    function test_ConvictionGrowsOverTime() public {
        vm.startPrank(alice);
        clawd.approve(address(staking), 1000 ether);
        staking.stake(1000 ether);
        vm.stopPrank();

        // Fast forward 1 hour
        vm.warp(block.timestamp + 3600);

        uint256 conviction = staking.getClawdviction(alice);
        assertEq(conviction, 1000 ether * 3600);
    }

    function test_Unstake() public {
        vm.startPrank(alice);
        clawd.approve(address(staking), 1000 ether);
        staking.stake(1000 ether);

        vm.warp(block.timestamp + 3600);
        staking.unstake(0);
        vm.stopPrank();

        assertEq(staking.totalStaked(alice), 0);
        assertEq(clawd.balanceOf(alice), 10_000 ether); // Got tokens back
    }

    function test_CannotStakeZero() public {
        vm.startPrank(alice);
        vm.expectRevert("Cannot stake 0");
        staking.stake(0);
        vm.stopPrank();
    }

    function test_MultipleStakes() public {
        vm.startPrank(alice);
        clawd.approve(address(staking), 2000 ether);
        staking.stake(1000 ether);
        
        vm.warp(block.timestamp + 3600);
        staking.stake(1000 ether);
        
        vm.warp(block.timestamp + 3600);
        vm.stopPrank();

        // First stake: 1000 * 7200 = 7,200,000
        // Second stake: 1000 * 3600 = 3,600,000
        uint256 conviction = staking.getClawdviction(alice);
        assertEq(conviction, 1000 ether * 7200 + 1000 ether * 3600);
    }
}
