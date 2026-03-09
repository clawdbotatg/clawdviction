// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title ClawdViction Staking (v2 — simplified)
/// @notice Dead-simple stake/unstake. Clawdviction calculated off-chain from events.
contract ClawdVictionStaking {
    using SafeERC20 for IERC20;

    IERC20 public immutable clawdToken;
    uint256 public constant MIN_STAKE = 1_000e18;

    struct Stake {
        uint256 amount;
        uint256 stakedAt;
    }

    mapping(address => Stake[]) public stakes;
    mapping(address => uint256) public totalStaked;
    uint256 public totalSupplyStaked;

    // O(1) clawdviction tracking
    mapping(address => uint256) public clawdvictionAccrued;
    mapping(address => uint256) public weightedStakeSum;

    event Staked(address indexed user, uint256 amount, uint256 stakeIndex, uint256 stakedAt);
    event Unstaked(address indexed user, uint256 amount, uint256 stakeIndex, uint256 stakedAt, uint256 unstakedAt);

    constructor(address _clawdToken) {
        clawdToken = IERC20(_clawdToken);
    }

    function stake(uint256 amount) external {
        require(amount >= MIN_STAKE, "Below minimum stake");
        clawdToken.safeTransferFrom(msg.sender, address(this), amount);
        uint256 stakeIndex = stakes[msg.sender].length;
        stakes[msg.sender].push(Stake({ amount: amount, stakedAt: block.timestamp }));
        totalStaked[msg.sender] += amount;
        totalSupplyStaked += amount;
        weightedStakeSum[msg.sender] += amount * block.timestamp;
        emit Staked(msg.sender, amount, stakeIndex, block.timestamp);
    }

    function unstake(uint256 stakeIndex) external {
        require(stakeIndex < stakes[msg.sender].length, "Invalid stake index");
        Stake storage s = stakes[msg.sender][stakeIndex];
        require(s.amount > 0, "Already unstaked");
        uint256 amount = s.amount;
        uint256 stakedAt = s.stakedAt;
        uint256 clawdviction = amount * (block.timestamp - stakedAt);
        clawdvictionAccrued[msg.sender] += clawdviction;
        s.amount = 0;
        totalStaked[msg.sender] -= amount;
        weightedStakeSum[msg.sender] -= amount * stakedAt;
        totalSupplyStaked -= amount;
        clawdToken.safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount, stakeIndex, stakedAt, block.timestamp);
    }

    function getClawdviction(address user) public view returns (uint256) {
        return clawdvictionAccrued[user] + totalStaked[user] * block.timestamp - weightedStakeSum[user];
    }

    function getStakeCount(address user) external view returns (uint256) {
        return stakes[user].length;
    }

    function getActiveStakes(address user) external view returns (
        uint256[] memory amounts,
        uint256[] memory stakedAts,
        uint256[] memory indices
    ) {
        Stake[] storage userStakes = stakes[user];
        uint256 len = userStakes.length;
        uint256 count = 0;
        for (uint256 i = 0; i < len; i++) {
            if (userStakes[i].amount > 0) count++;
        }
        amounts = new uint256[](count);
        stakedAts = new uint256[](count);
        indices = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < len; i++) {
            if (userStakes[i].amount > 0) {
                amounts[idx] = userStakes[i].amount;
                stakedAts[idx] = userStakes[i].stakedAt;
                indices[idx] = i;
                idx++;
            }
        }
    }
}
