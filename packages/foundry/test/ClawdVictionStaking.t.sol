// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/MockCLAWD.sol";
import "../contracts/ClawdVictionStaking.sol";

contract ClawdVictionStakingTest is Test {
    MockCLAWD public clawd;
    ClawdVictionStaking public staking;
    address public alice = makeAddr("alice");

    uint256 constant MIN_STAKE = 1_000e18;

    function setUp() public {
        clawd = new MockCLAWD();
        staking = new ClawdVictionStaking(address(clawd));
        
        // Give alice some tokens
        clawd.faucet(alice, 1_000_000 ether);
    }

    function test_Stake() public {
        vm.startPrank(alice);
        clawd.approve(address(staking), MIN_STAKE);
        staking.stake(MIN_STAKE);
        vm.stopPrank();

        assertEq(staking.totalStaked(alice), MIN_STAKE);
        assertEq(staking.getStakeCount(alice), 1);
    }

    function test_ConvictionGrowsOverTime() public {
        vm.startPrank(alice);
        clawd.approve(address(staking), MIN_STAKE);
        staking.stake(MIN_STAKE);
        vm.stopPrank();

        // Fast forward 1 hour
        vm.warp(block.timestamp + 3600);

        uint256 conviction = staking.getClawdviction(alice);
        assertEq(conviction, MIN_STAKE * 3600);
    }

    function test_Unstake() public {
        vm.startPrank(alice);
        clawd.approve(address(staking), MIN_STAKE);
        staking.stake(MIN_STAKE);

        vm.warp(block.timestamp + 3600);
        staking.unstake(0);
        vm.stopPrank();

        assertEq(staking.totalStaked(alice), 0);
        assertEq(clawd.balanceOf(alice), 1_000_000 ether); // Got tokens back
    }

    function test_CannotStakeZero() public {
        vm.startPrank(alice);
        vm.expectRevert("Below minimum stake");
        staking.stake(0);
        vm.stopPrank();
    }

    function test_CannotStakeBelowMinimum() public {
        vm.startPrank(alice);
        clawd.approve(address(staking), 999e18);
        vm.expectRevert("Below minimum stake");
        staking.stake(999e18);
        vm.stopPrank();
    }

    function test_MultipleStakes() public {
        vm.startPrank(alice);
        clawd.approve(address(staking), MIN_STAKE * 2);
        staking.stake(MIN_STAKE);
        
        vm.warp(block.timestamp + 3600);
        staking.stake(MIN_STAKE);
        
        vm.warp(block.timestamp + 3600);
        vm.stopPrank();

        // First stake: MIN_STAKE * 7200
        // Second stake: MIN_STAKE * 3600
        uint256 conviction = staking.getClawdviction(alice);
        assertEq(conviction, MIN_STAKE * 7200 + MIN_STAKE * 3600);
    }

}
