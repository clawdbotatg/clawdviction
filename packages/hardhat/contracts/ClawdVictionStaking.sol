// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title ClawdViction Staking
/// @notice Stake $CLAWD tokens to earn clawdviction (amount × time).
///         Clawdviction determines governance weight for your AI larva.
contract ClawdVictionStaking {
    using SafeERC20 for IERC20;

    IERC20 public immutable clawdToken;

    /// @notice Minimum stake amount to prevent dust spam (1,000 CLAWD)
    uint256 public constant MIN_STAKE = 1_000e18;

    struct Stake {
        uint256 amount;
        uint256 stakedAt;
    }

    mapping(address => Stake[]) public stakes;
    mapping(address => uint256) public totalStaked; // user's total active staked amount
    uint256 public totalSupplyStaked;

    // O(1) clawdviction tracking
    mapping(address => uint256) public clawdvictionAccrued;
    mapping(address => uint256) public weightedStakeSum;

    event Staked(address indexed user, uint256 amount, uint256 stakeIndex);
    event Unstaked(address indexed user, uint256 amount, uint256 stakeIndex, uint256 clawdviction);

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
        emit Staked(msg.sender, amount, stakeIndex);
    }

    function unstake(uint256 stakeIndex) external {
        require(stakeIndex < stakes[msg.sender].length, "Invalid stake index");
        Stake storage s = stakes[msg.sender][stakeIndex];
        require(s.amount > 0, "Already unstaked");
        uint256 amount = s.amount;
        uint256 stakedAt = s.stakedAt;
        uint256 clawdviction = amount * (block.timestamp - stakedAt);
        clawdvictionAccrued[msg.sender] += clawdviction;
        totalStaked[msg.sender] -= amount;
        weightedStakeSum[msg.sender] -= amount * stakedAt;
        s.amount = 0;
        totalSupplyStaked -= amount;
        clawdToken.safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount, stakeIndex, clawdviction);
    }

    function getStakeClawdviction(address user, uint256 stakeIndex) public view returns (uint256) {
        require(stakeIndex < stakes[user].length, "Invalid stake index");
        Stake storage s = stakes[user][stakeIndex];
        if (s.amount == 0) return 0;
        return s.amount * (block.timestamp - s.stakedAt);
    }

    function getClawdviction(address user) public view returns (uint256) {
        return clawdvictionAccrued[user] + totalStaked[user] * block.timestamp - weightedStakeSum[user];
    }

    function getStakeCount(address user) external view returns (uint256) {
        return stakes[user].length;
    }

    function getActiveStakes(address user) external view returns (uint256[] memory amounts, uint256[] memory stakedAts) {
        Stake[] storage userStakes = stakes[user];
        uint256 len = userStakes.length;
        uint256 count = 0;
        for (uint256 i = 0; i < len; i++) {
            if (userStakes[i].amount > 0) count++;
        }
        amounts = new uint256[](count);
        stakedAts = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < len; i++) {
            Stake memory s = userStakes[i];
            if (s.amount > 0) {
                amounts[idx] = s.amount;
                stakedAts[idx] = s.stakedAt;
                idx++;
            }
        }
    }
}
