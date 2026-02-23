"use client";

import { useCallback, useEffect, useState } from "react";
import type { NextPage } from "next";
import { formatEther, parseEther } from "viem";
import { useAccount } from "wagmi";
import { Address, RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import {
  useDeployedContractInfo,
  useScaffoldReadContract,
  useScaffoldWriteContract,
  useTargetNetwork,
} from "~~/hooks/scaffold-eth";

const BACKEND_URL = "http://localhost:3001";

const StakePage: NextPage = () => {
  const { address: connectedAddress, chain } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const [stakeAmount, setStakeAmount] = useState("");
  const [clawdvictionScore, setClawdvictionScore] = useState("0");
  const [, setActiveStakesFromBackend] = useState<any[]>([]);

  // Contract info
  const { data: stakingContractData } = useDeployedContractInfo("ClawdVictionStaking");

  // Read contract data
  const { data: totalStaked } = useScaffoldReadContract({
    contractName: "ClawdVictionStaking",
    functionName: "totalStaked",
    args: [connectedAddress],
    watch: true,
  });

  const { data: totalSupplyStaked } = useScaffoldReadContract({
    contractName: "ClawdVictionStaking",
    functionName: "totalSupplyStaked",
    watch: true,
  });

  const { data: clawdBalance } = useScaffoldReadContract({
    contractName: "MockCLAWD",
    functionName: "balanceOf",
    args: [connectedAddress],
    watch: true,
  });

  const { data: allowance } = useScaffoldReadContract({
    contractName: "MockCLAWD",
    functionName: "allowance",
    args: [connectedAddress, stakingContractData?.address],
    watch: true,
  });

  const { data: activeStakesData } = useScaffoldReadContract({
    contractName: "ClawdVictionStaking",
    functionName: "getActiveStakes",
    args: [connectedAddress],
    watch: true,
  });

  // Write hooks - SEPARATE for each action
  const { writeContractAsync: approveWrite, isMining: isApproving } = useScaffoldWriteContract("MockCLAWD");
  const { writeContractAsync: stakeWrite, isMining: isStaking } = useScaffoldWriteContract("ClawdVictionStaking");
  const { writeContractAsync: unstakeWrite, isMining: isUnstaking } = useScaffoldWriteContract("ClawdVictionStaking");
  const { writeContractAsync: faucetWrite, isMining: isFauceting } = useScaffoldWriteContract("MockCLAWD");

  // Track which unstake button is loading
  const [unstakingIndex, setUnstakingIndex] = useState<number | null>(null);

  // Poll backend for clawdviction score
  const fetchClawdviction = useCallback(async () => {
    if (!connectedAddress) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/clawdviction/${connectedAddress}`);
      const data = await res.json();
      setClawdvictionScore(data.clawdviction || "0");
      setActiveStakesFromBackend(data.activeStakes || []);
    } catch {
      // Backend might not be running — fall back to on-chain
    }
  }, [connectedAddress]);

  useEffect(() => {
    fetchClawdviction();
    const interval = setInterval(fetchClawdviction, 2000);
    return () => clearInterval(interval);
  }, [fetchClawdviction]);

  // Determine state
  const isWrongNetwork = chain && chain.id !== targetNetwork.id;
  const parsedAmount = stakeAmount ? parseEther(stakeAmount) : 0n;
  const needsApproval = parsedAmount > 0n && (allowance ?? 0n) < parsedAmount;

  const formatClawdviction = (score: string) => {
    const n = Number(score) / 1e18; // scores are in wei-seconds
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toFixed(0);
  };

  // Handlers
  const handleApprove = async () => {
    if (!stakingContractData?.address || parsedAmount <= 0n) return;
    await approveWrite({
      functionName: "approve",
      args: [stakingContractData.address, parsedAmount],
    });
  };

  const handleStake = async () => {
    if (parsedAmount <= 0n) return;
    await stakeWrite({
      functionName: "stake",
      args: [parsedAmount],
    });
    setStakeAmount("");
  };

  const handleUnstake = async (index: number) => {
    setUnstakingIndex(index);
    try {
      await unstakeWrite({
        functionName: "unstake",
        args: [BigInt(index)],
      });
    } finally {
      setUnstakingIndex(null);
    }
  };

  const handleFaucet = async () => {
    if (!connectedAddress) return;
    await faucetWrite({
      functionName: "faucet",
      args: [connectedAddress, parseEther("10000")],
    });
  };

  // --- RENDER ---

  // State 1: Not connected
  if (!connectedAddress) {
    return (
      <div className="flex items-center flex-col flex-grow pt-20">
        <div className="text-6xl mb-4">🦀</div>
        <p className="text-base-content/60 mb-6">Connect your wallet to start staking $CLAWD</p>
        <RainbowKitCustomConnectButton />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center flex-grow pt-10 px-5">
      <p className="text-base-content/60 mb-8">Earn clawdviction. Grow your governance power. 🦀</p>

      {/* Stats */}
      <div className="grid md:grid-cols-3 gap-4 w-full max-w-3xl mb-8">
        <div className="stat bg-base-200 rounded-xl shadow">
          <div className="stat-title">Your Staked</div>
          <div className="stat-value text-error text-2xl">
            {totalStaked ? Number(formatEther(totalStaked)).toLocaleString() : "0"} CLAWD
          </div>
        </div>
        <div className="stat bg-base-200 rounded-xl shadow">
          <div className="stat-title">Your ClawdViction</div>
          <div className="stat-value text-error text-2xl">{formatClawdviction(clawdvictionScore)} 🦀</div>
        </div>
        <div className="stat bg-base-200 rounded-xl shadow">
          <div className="stat-title">Total Staked (All)</div>
          <div className="stat-value text-2xl">
            {totalSupplyStaked ? Number(formatEther(totalSupplyStaked)).toLocaleString() : "0"}
          </div>
        </div>
      </div>

      {/* Staking Form */}
      <div className="card bg-base-200 shadow-lg w-full max-w-lg">
        <div className="card-body">
          <h2 className="card-title">Stake Tokens</h2>
          <p className="text-sm text-base-content/60 mb-4">
            Balance: {clawdBalance ? Number(formatEther(clawdBalance)).toLocaleString() : "0"} CLAWD
          </p>

          <input
            type="number"
            placeholder="Amount to stake"
            className="input input-bordered w-full mb-4"
            value={stakeAmount}
            onChange={e => setStakeAmount(e.target.value)}
          />

          {/* Four-state flow: ONE button at a time */}
          {isWrongNetwork ? (
            <button className="btn btn-warning w-full" onClick={() => {}}>
              ⚠️ Switch to {targetNetwork.name}
            </button>
          ) : needsApproval ? (
            <button
              className="btn btn-secondary w-full"
              onClick={handleApprove}
              disabled={isApproving || parsedAmount <= 0n}
            >
              {isApproving ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span> Approving...
                </>
              ) : (
                "Approve $CLAWD"
              )}
            </button>
          ) : (
            <button className="btn btn-primary w-full" onClick={handleStake} disabled={isStaking || parsedAmount <= 0n}>
              {isStaking ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span> Staking...
                </>
              ) : (
                "Stake 🦀"
              )}
            </button>
          )}

          {/* Faucet */}
          <div className="divider">Testing</div>
          <button className="btn btn-outline btn-sm" onClick={handleFaucet} disabled={isFauceting}>
            {isFauceting ? (
              <>
                <span className="loading loading-spinner loading-xs"></span> Minting...
              </>
            ) : (
              "🚰 Get 10,000 Test CLAWD"
            )}
          </button>
        </div>
      </div>

      {/* Active Stakes */}
      {activeStakesData && activeStakesData[0] && activeStakesData[0].length > 0 && (
        <div className="card bg-base-200 shadow-lg w-full max-w-lg mt-6">
          <div className="card-body">
            <h2 className="card-title">Your Stakes</h2>
            <div className="space-y-3">
              {activeStakesData[0].map((amount: bigint, i: number) => (
                <div key={i} className="flex items-center justify-between bg-base-100 rounded-lg p-3">
                  <div>
                    <span className="font-bold">{Number(formatEther(amount)).toLocaleString()} CLAWD</span>
                    <span className="text-xs text-base-content/50 ml-2">
                      since {new Date(Number(activeStakesData[1][i]) * 1000).toLocaleDateString()}
                    </span>
                  </div>
                  <button
                    className="btn btn-error btn-sm"
                    onClick={() => handleUnstake(i)}
                    disabled={isUnstaking && unstakingIndex === i}
                  >
                    {isUnstaking && unstakingIndex === i ? (
                      <span className="loading loading-spinner loading-xs"></span>
                    ) : (
                      "Unstake"
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Contract Address */}
      {stakingContractData?.address && (
        <div className="mt-8 text-center text-sm text-base-content/50">
          <p>Staking Contract</p>
          <Address address={stakingContractData.address} />
        </div>
      )}
    </div>
  );
};

export default StakePage;
