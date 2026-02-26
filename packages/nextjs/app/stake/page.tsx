"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFetchNativeCurrencyPrice } from "@scaffold-ui/hooks";
import type { NextPage } from "next";
import { formatEther, parseEther } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { Address, RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import {
  useDeployedContractInfo,
  useScaffoldReadContract,
  useScaffoldWriteContract,
  useTargetNetwork,
} from "~~/hooks/scaffold-eth";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "";

const CLAWD_ETH_POOL = "0xCD55381a53da35Ab1D7Bc5e3fE5F76cac976FAc3" as const;
const WETH_BASE = "0x4200000000000000000000000000000000000006";
const POOL_ABI = [
  {
    inputs: [],
    name: "slot0",
    outputs: [
      { internalType: "uint160", name: "sqrtPriceX96", type: "uint160" },
      { internalType: "int24", name: "tick", type: "int24" },
      { internalType: "uint16", name: "observationIndex", type: "uint16" },
      { internalType: "uint16", name: "observationCardinality", type: "uint16" },
      { internalType: "uint16", name: "observationCardinalityNext", type: "uint16" },
      { internalType: "uint8", name: "feeProtocol", type: "uint8" },
      { internalType: "bool", name: "unlocked", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "token0",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

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

  // CLAWD/ETH Uniswap V3 price
  const { price: ethPrice } = useFetchNativeCurrencyPrice();
  const { data: slot0Data } = useReadContract({ address: CLAWD_ETH_POOL, abi: POOL_ABI, functionName: "slot0" });
  const { data: token0Data } = useReadContract({ address: CLAWD_ETH_POOL, abi: POOL_ABI, functionName: "token0" });

  const clawdUsdPrice = useMemo(() => {
    try {
      if (!slot0Data || !token0Data || !ethPrice) return null;
      const sqrtPriceX96 = slot0Data[0];
      const sqrtPrice = Number(sqrtPriceX96) / 2 ** 96;
      const priceToken1PerToken0 = sqrtPrice * sqrtPrice;
      const isWethToken0 = token0Data.toLowerCase() === WETH_BASE.toLowerCase();
      const clawdInEth = isWethToken0 ? 1 / priceToken1PerToken0 : priceToken1PerToken0;
      return clawdInEth * ethPrice;
    } catch {
      return null;
    }
  }, [slot0Data, token0Data, ethPrice]);

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
  const isLocalNetwork = targetNetwork.id === 31337;
  const needsApproval = parsedAmount > 0n && ((allowance as bigint) ?? 0n) < parsedAmount;

  const formatClawdviction = (score: string) => {
    const n = Number(score) / 1e18; // scores are in wei-seconds
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toFixed(0);
  };

  // Handlers
  const openWalletDeepLink = () => {
    // Only attempt deep link on mobile when no injected provider
    if (typeof window !== "undefined" && !window.ethereum && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
      // Use MetaMask universal link as primary, with WalletConnect as fallback
      window.location.href = `https://metamask.app.link/dapp/${window.location.host}`;
    }
  };

  const handleApprove = async () => {
    if (!stakingContractData?.address || parsedAmount <= 0n) return;
    await approveWrite({
      functionName: "approve",
      args: [stakingContractData.address, parsedAmount],
    });
    setTimeout(openWalletDeepLink, 2000);
  };

  const handleStake = async () => {
    if (parsedAmount <= 0n) return;
    await stakeWrite({
      functionName: "stake",
      args: [parsedAmount],
    });
    setStakeAmount("");
    setTimeout(openWalletDeepLink, 2000);
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
        <RainbowKitCustomConnectButton />
        <div className="bg-base-100/60 backdrop-blur-sm rounded-xl px-5 py-3 mt-6">
          <p className="text-base-content/60">Connect your wallet to start staking $CLAWD</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center flex-grow pt-10 px-5">
      <div className="bg-base-100/60 backdrop-blur-sm rounded-xl px-5 py-2 mb-8">
        <p className="text-base-content/60">Earn clawdviction. Grow your governance power. 🦀</p>
      </div>

      {/* Stats */}
      <div className="grid md:grid-cols-3 gap-4 w-full max-w-3xl mb-8">
        <div className="stat bg-base-200 rounded-xl shadow">
          <div className="stat-title">Your Staked</div>
          <div className="stat-value text-error text-2xl">
            {totalStaked ? Number(formatEther(totalStaked)).toLocaleString() : "0"} CLAWD
          </div>
          {clawdUsdPrice && totalStaked && totalStaked > 0n && (
            <div className="stat-desc">
              $
              {(Number(formatEther(totalStaked)) * clawdUsdPrice).toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}
            </div>
          )}
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
            {clawdUsdPrice && clawdBalance && clawdBalance > 0n && (
              <span className="ml-1">(${(Number(formatEther(clawdBalance)) * clawdUsdPrice).toFixed(2)})</span>
            )}
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

          {/* Faucet — local dev only */}
          {isLocalNetwork && (
            <>
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
            </>
          )}
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
