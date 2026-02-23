// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title ClawdViction Staking
/// @notice Stake $CLAWD tokens to earn clawdviction (amount × time).
///         Clawdviction determines governance weight for your AI larva.
contract ClawdVictionStaking is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable clawdToken;

    struct Stake {
        uint256 amount;
        uint256 stakedAt;
    }

    mapping(address => Stake[]) public stakes;
    mapping(address => uint256) public totalStaked;
    uint256 public totalSupplyStaked;

    event Staked(address indexed user, uint256 amount, uint256 stakeIndex);
    event Unstaked(address indexed user, uint256 amount, uint256 stakeIndex, uint256 clawdviction);

    constructor(address _clawdToken) Ownable(msg.sender) {
        clawdToken = IERC20(_clawdToken);
    }

    function stake(uint256 amount) external {
        require(amount > 0, "Cannot stake 0");
        clawdToken.safeTransferFrom(msg.sender, address(this), amount);
        uint256 stakeIndex = stakes[msg.sender].length;
        stakes[msg.sender].push(Stake({ amount: amount, stakedAt: block.timestamp }));
        totalStaked[msg.sender] += amount;
        totalSupplyStaked += amount;
        emit Staked(msg.sender, amount, stakeIndex);
    }

    function unstake(uint256 stakeIndex) external {
        require(stakeIndex < stakes[msg.sender].length, "Invalid stake index");
        Stake storage s = stakes[msg.sender][stakeIndex];
        require(s.amount > 0, "Already unstaked");
        uint256 amount = s.amount;
        uint256 clawdviction = amount * (block.timestamp - s.stakedAt);
        s.amount = 0;
        totalStaked[msg.sender] -= amount;
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
        uint256 total = 0;
        for (uint256 i = 0; i < stakes[user].length; i++) {
            if (stakes[user][i].amount > 0) {
                total += stakes[user][i].amount * (block.timestamp - stakes[user][i].stakedAt);
            }
        }
        return total;
    }

    function getStakeCount(address user) external view returns (uint256) {
        return stakes[user].length;
    }

    function getActiveStakes(address user) external view returns (uint256[] memory amounts, uint256[] memory stakedAts) {
        uint256 count = 0;
        for (uint256 i = 0; i < stakes[user].length; i++) {
            if (stakes[user][i].amount > 0) count++;
        }
        amounts = new uint256[](count);
        stakedAts = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < stakes[user].length; i++) {
            if (stakes[user][i].amount > 0) {
                amounts[idx] = stakes[user][i].amount;
                stakedAts[idx] = stakes[user][i].stakedAt;
                idx++;
            }
        }
    }
}
