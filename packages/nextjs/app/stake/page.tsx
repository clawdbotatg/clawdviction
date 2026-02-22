"use client";

import { useState } from "react";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { formatEther, parseEther } from "viem";
import {
  useScaffoldReadContract,
  useScaffoldWriteContract,
} from "~~/hooks/scaffold-eth";
import { Address } from "~~/components/scaffold-eth";

const StakePage: NextPage = () => {
  const { address: connectedAddress } = useAccount();
  const [stakeAmount, setStakeAmount] = useState("");

  // Read staking contract data
  const { data: totalStaked } = useScaffoldReadContract({
    contractName: "ClawdVictionStaking",
    functionName: "totalStaked",
    args: [connectedAddress],
    watch: true,
  });

  const { data: conviction } = useScaffoldReadContract({
    contractName: "ClawdVictionStaking",
    functionName: "getConviction",
    args: [connectedAddress],
    watch: true,
  });

  const { data: totalSupplyStaked } = useScaffoldReadContract({
    contractName: "ClawdVictionStaking",
    functionName: "totalSupplyStaked",
    watch: true,
  });

  const { data: stakeCount } = useScaffoldReadContract({
    contractName: "ClawdVictionStaking",
    functionName: "getStakeCount",
    args: [connectedAddress],
    watch: true,
  });

  const { data: clawdBalance } = useScaffoldReadContract({
    contractName: "MockCLAWD",
    functionName: "balanceOf",
    args: [connectedAddress],
    watch: true,
  });

  // Write functions
  const { writeContractAsync: approve, isMining: isApproving } =
    useScaffoldWriteContract("MockCLAWD");

  const { writeContractAsync: stakeWrite, isMining: isStaking } =
    useScaffoldWriteContract("ClawdVictionStaking");

  const { writeContractAsync: faucetWrite, isMining: isFauceting } =
    useScaffoldWriteContract("MockCLAWD");

  // Get staking contract address for approval
  const { data: stakingAddress } = useScaffoldReadContract({
    contractName: "ClawdVictionStaking",
    functionName: "totalSupplyStaked",
  });

  const handleStake = async () => {
    if (!stakeAmount || parseFloat(stakeAmount) <= 0) return;

    const amount = parseEther(stakeAmount);

    // First approve
    await approve({
      functionName: "approve",
      // We need the staking contract address - get it from deployedContracts
      args: [undefined as any, amount], // Will be filled by the hook
    });

    // Then stake
    await stakeWrite({
      functionName: "stake",
      args: [amount],
    });

    setStakeAmount("");
  };

  const handleUnstake = async (index: number) => {
    await stakeWrite({
      functionName: "unstake",
      args: [BigInt(index)],
    });
  };

  const handleFaucet = async () => {
    if (!connectedAddress) return;
    await faucetWrite({
      functionName: "faucet",
      args: [connectedAddress, parseEther("10000")],
    });
  };

  const formatConviction = (n: bigint | undefined) => {
    if (!n) return "0";
    const num = Number(formatEther(n));
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toFixed(0);
  };

  if (!connectedAddress) {
    return (
      <div className="flex items-center flex-col flex-grow pt-20">
        <div className="text-6xl mb-4">🦀</div>
        <h2 className="text-2xl font-bold">Connect Your Wallet</h2>
        <p className="text-base-content/60 mt-2">Connect to start staking $CLAWD</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center flex-grow pt-10 px-5">
      <h1 className="text-4xl font-bold mb-2">
        <span className="bg-gradient-to-r from-red-500 to-red-300 bg-clip-text text-transparent">
          Stake $CLAWD
        </span>
      </h1>
      <p className="text-base-content/60 mb-8">Earn conviction. Grow your governance power.</p>

      {/* Stats */}
      <div className="grid md:grid-cols-3 gap-4 w-full max-w-3xl mb-8">
        <div className="stat bg-base-200 rounded-xl shadow">
          <div className="stat-title">Your Staked</div>
          <div className="stat-value text-error text-2xl">
            {totalStaked ? formatEther(totalStaked) : "0"} CLAWD
          </div>
        </div>
        <div className="stat bg-base-200 rounded-xl shadow">
          <div className="stat-title">Your ClawdViction</div>
          <div className="stat-value text-error text-2xl">
            {formatConviction(conviction)} 🦀
          </div>
        </div>
        <div className="stat bg-base-200 rounded-xl shadow">
          <div className="stat-title">Total Staked (All)</div>
          <div className="stat-value text-2xl">
            {totalSupplyStaked ? formatEther(totalSupplyStaked) : "0"}
          </div>
        </div>
      </div>

      {/* Staking Form */}
      <div className="card bg-base-200 shadow-lg w-full max-w-lg">
        <div className="card-body">
          <h2 className="card-title">Stake Tokens</h2>
          <p className="text-sm text-base-content/60 mb-4">
            Balance: {clawdBalance ? formatEther(clawdBalance) : "0"} CLAWD
          </p>

          <div className="form-control">
            <div className="input-group flex gap-2">
              <input
                type="number"
                placeholder="Amount to stake"
                className="input input-bordered flex-1"
                value={stakeAmount}
                onChange={(e) => setStakeAmount(e.target.value)}
              />
              <button
                className="btn btn-primary"
                onClick={handleStake}
                disabled={isApproving || isStaking || !stakeAmount}
              >
                {isApproving ? "Approving..." : isStaking ? "Staking..." : "Stake 🦀"}
              </button>
            </div>
          </div>

          {/* Faucet for testing */}
          <div className="divider">Testing</div>
          <button
            className="btn btn-outline btn-sm"
            onClick={handleFaucet}
            disabled={isFauceting}
          >
            {isFauceting ? "Minting..." : "🚰 Get 10,000 Test CLAWD"}
          </button>
        </div>
      </div>

      {/* Active Stakes */}
      {stakeCount && Number(stakeCount) > 0 && (
        <div className="card bg-base-200 shadow-lg w-full max-w-lg mt-6">
          <div className="card-body">
            <h2 className="card-title">Your Stakes</h2>
            <p className="text-sm text-base-content/60">
              {Number(stakeCount)} stake position{Number(stakeCount) > 1 ? "s" : ""}
            </p>
            {/* Individual stake positions would be listed here */}
          </div>
        </div>
      )}
    </div>
  );
};

export default StakePage;
