"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useFetchNativeCurrencyPrice } from "@scaffold-ui/hooks";
import type { NextPage } from "next";
import { formatEther, parseEther } from "viem";
import { useAccount, useReadContract, useSwitchChain } from "wagmi";
import { Address, RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import {
  useDeployedContractInfo,
  useScaffoldReadContract,
  useScaffoldWriteContract,
  useTargetNetwork,
} from "~~/hooks/scaffold-eth";

const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD" as const;
const CLAWD_TOKEN = "0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07" as const;
const CLAWD_ETH_POOL = "0xCD55381a53da35Ab1D7Bc5e3fE5F76cac976FAc3" as const;
const WETH_BASE = "0x4200000000000000000000000000000000000006" as const;

const ERC20_ABI = [
  {
    inputs: [],
    name: "totalSupply",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
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
  const { address: connectedAddress, chain, connector, status: walletStatus } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const { switchChain } = useSwitchChain();
  const [mounted, setMounted] = useState(false);
  const [stakeAmount, setStakeAmount] = useState("");
  const [clawdvictionScore, setClawdvictionScore] = useState<string | null>(null);
  const [cvAccrualRate, setCvAccrualRate] = useState<string>("0");
  const [cvFetchedAt, setCvFetchedAt] = useState<number>(Date.now());
  const [cvBase, setCvBase] = useState<string>("0");
  const [liveClawdviction, setLiveClawdviction] = useState<string | null>(null);

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

  // Circulating supply via direct ERC20 reads (no deployedContracts.ts edit)
  const { data: clawdTotalSupply } = useReadContract({
    address: CLAWD_TOKEN,
    abi: ERC20_ABI,
    functionName: "totalSupply",
  });

  const { data: burnBalance } = useReadContract({
    address: CLAWD_TOKEN,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [BURN_ADDRESS],
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

  // Circulating supply & staked percentage
  const { stakedPct, burnedFormatted } = useMemo(() => {
    if (!clawdTotalSupply || !burnBalance || !totalSupplyStaked) {
      return { stakedPct: null, burnedFormatted: null };
    }
    const circulating = clawdTotalSupply - burnBalance;
    const pct =
      circulating > 0n ? (Number(formatEther(totalSupplyStaked)) / Number(formatEther(circulating))) * 100 : 0;
    const burnedNum = Number(formatEther(burnBalance));
    let burned: string;
    if (burnedNum >= 1_000_000_000) burned = `${(burnedNum / 1_000_000_000).toFixed(2)}B`;
    else if (burnedNum >= 1_000_000) burned = `${(burnedNum / 1_000_000).toFixed(2)}M`;
    else burned = burnedNum.toLocaleString();
    return { stakedPct: pct, burnedFormatted: burned };
  }, [clawdTotalSupply, burnBalance, totalSupplyStaked]);

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
  // Hold approve button disabled for 4s after tx confirms while allowance state catches up
  const [approveCooldown, setApproveCooldown] = useState(false);

  // Active stake indices now come directly from getActiveStakes (3rd return value)

  useEffect(() => {
    setMounted(true);
  }, []);

  // Safety timeout — if clawdviction never resolves after 8s, default to "0"
  useEffect(() => {
    if (!connectedAddress) return;
    const t = setTimeout(() => setClawdvictionScore(s => (s === null ? "0" : s)), 8000);
    return () => clearTimeout(t);
  }, [connectedAddress]);

  // Poll backend for clawdviction score
  const fetchClawdviction = useCallback(async () => {
    if (!connectedAddress) return;
    try {
      const res = await fetch(`/api/clawdviction/${connectedAddress}`);
      const data = await res.json();
      if (data.error) throw new Error("CV fetch error");
      setClawdvictionScore(data.clawdviction ?? "0");
      if (data.accrualRate != null) setCvAccrualRate(data.accrualRate);
      setCvBase(data.clawdviction ?? "0");
      setCvFetchedAt(Date.now());
    } catch {
      // Leave as null on failure — interval will retry
    }
  }, [connectedAddress]);

  useEffect(() => {
    fetchClawdviction();
    const interval = setInterval(fetchClawdviction, 30000);
    return () => clearInterval(interval);
  }, [fetchClawdviction]);

  // Live optimistic counter — ticks every second
  useEffect(() => {
    const rate = Number(cvAccrualRate); // float: clawdviction per second
    const baseVal = BigInt(cvBase);
    const fetchTime = cvFetchedAt;

    const tick = () => {
      const elapsedSec = Math.max(0, Math.floor((Date.now() - fetchTime) / 1000));
      const pending = BigInt(Math.floor(rate * elapsedSec));
      const current = baseVal + pending;
      setLiveClawdviction(current.toString());
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [cvBase, cvAccrualRate, cvFetchedAt]);

  // Determine state
  const isWrongNetwork = chain && chain.id !== targetNetwork.id;
  const parsedAmount = stakeAmount ? parseEther(stakeAmount) : 0n;
  const isLocalNetwork = targetNetwork.id === 31337;
  const needsApproval = parsedAmount > 0n && ((allowance as bigint) ?? 0n) < parsedAmount;

  const formatClawdviction = (score: string, live = false) => {
    const n = Number(score);
    // Live counter: show enough digits that ticking is visible
    if (live) {
      if (n >= 10_000_000) return `${(n / 1_000_000).toFixed(3)}M`;
      if (n >= 1_000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
      return n.toFixed(0);
    }
    // Static display
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    if (n >= 1) return n.toFixed(2);
    return n.toFixed(0);
  };

  const formatClawd = (value: bigint): string => {
    const n = Number(formatEther(value));
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
  };

  // --- Mobile deep link helpers (per ethskills.com/qa/SKILL.md) ---
  // Detect which wallet the user connected with and open it via URL scheme.
  // Checks connector info, wagmi storage, AND WalletConnect session data
  // so we never hardcode a single wallet.
  const openWallet = useCallback(() => {
    if (typeof window === "undefined") return;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (!isMobile || window.ethereum) return; // Skip on desktop or in-app browser

    const allIds = [connector?.id, connector?.name, localStorage.getItem("wagmi.recentConnectorId")]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    let wcWallet = "";
    try {
      const wcKey = Object.keys(localStorage).find(k => k.startsWith("wc@2:client"));
      if (wcKey) wcWallet = (localStorage.getItem(wcKey) || "").toLowerCase();
    } catch {
      /* ignore */
    }
    const search = `${allIds} ${wcWallet}`;

    const schemes: [string[], string][] = [
      [["rainbow"], "rainbow://"],
      [["metamask"], "metamask://"],
      [["coinbase", "cbwallet"], "cbwallet://"],
      [["trust"], "trust://"],
      [["phantom"], "phantom://"],
    ];

    for (const [keywords, scheme] of schemes) {
      if (keywords.some(k => search.includes(k))) {
        window.location.href = scheme;
        return;
      }
    }
  }, [connector]);

  // writeAndOpen: fire the TX first (sends over WalletConnect), then deep link
  // after 2s delay so the wallet has time to receive the signing request.
  // We do NOT await before scheduling the deep link — that would wait for
  // block confirmation, which is too late.
  const writeAndOpen = useCallback(
    <T,>(writeFn: () => Promise<T>): Promise<T> => {
      const promise = writeFn(); // Fire TX — gas estimation + WC relay
      setTimeout(openWallet, 2000); // Deep link AFTER request is relayed
      return promise;
    },
    [openWallet],
  );

  // Handlers
  const handleApprove = async () => {
    if (!stakingContractData?.address || parsedAmount <= 0n) return;
    await writeAndOpen(() =>
      approveWrite({
        functionName: "approve",
        args: [stakingContractData.address, parsedAmount],
      }),
    );
    // Hold button disabled for 4s while allowance state refreshes
    setApproveCooldown(true);
    setTimeout(() => setApproveCooldown(false), 4000);
  };

  const handleStake = async () => {
    if (parsedAmount <= 0n) return;
    await writeAndOpen(() =>
      stakeWrite({
        functionName: "stake",
        args: [parsedAmount],
      }),
    );
    setStakeAmount("");
  };

  const handleUnstake = async (displayIndex: number) => {
    // getActiveStakes now returns indices as 3rd array — use directly
    const contractIndex = activeStakesData?.[2]?.[displayIndex];
    if (contractIndex == null) return;
    setUnstakingIndex(displayIndex);
    try {
      await writeAndOpen(() =>
        unstakeWrite({
          functionName: "unstake",
          args: [contractIndex],
        }),
      );
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

  // Spinner until mounted + wallet known + clawdviction confirmed
  if (
    !mounted ||
    walletStatus === "connecting" ||
    walletStatus === "reconnecting" ||
    (connectedAddress && clawdvictionScore === null)
  ) {
    return (
      <div className="flex items-center justify-center flex-grow pt-20">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  // Not connected
  if (!connectedAddress) {
    return (
      <div className="flex items-center flex-col flex-grow pt-20">
        <div className="text-6xl mb-4">🦀</div>
        <RainbowKitCustomConnectButton />
        <div className="bg-base-100/60 backdrop-blur-sm rounded-none px-5 py-3 mt-6">
          <p className="text-base-content/60">Connect your wallet to start staking $CLAWD</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center flex-grow pt-10 px-5">
      <div className="bg-base-100/60 backdrop-blur-sm rounded-none px-5 py-2 mb-8">
        <p className="text-base-content/60">Earn conviction. Grow your governance power. 🦀</p>
      </div>

      {/* Stats */}
      <div className="grid md:grid-cols-3 gap-4 w-full max-w-4xl mb-8">
        <div className="stat bg-base-200 rounded-none shadow">
          <div className="stat-title">Your Staked</div>
          <div className="stat-value text-error text-2xl">{totalStaked ? formatClawd(totalStaked) : "0"} CLAWD</div>
          {clawdUsdPrice && totalStaked && totalStaked > 0n && (
            <div className="stat-desc">
              $
              {(Number(formatEther(totalStaked)) * clawdUsdPrice).toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}
            </div>
          )}
        </div>
        <div className="stat bg-base-200 rounded-none shadow">
          <div className="stat-title">Your Conviction</div>
          <div className="stat-value text-error text-2xl tabular-nums">
            {formatClawdviction(liveClawdviction ?? clawdvictionScore ?? "0", true)} 🦀
          </div>
        </div>
        <div className="stat bg-base-200 rounded-none shadow">
          <div className="stat-title">Total Staked (All)</div>
          <div className="stat-value text-2xl">
            {totalSupplyStaked ? formatClawd(totalSupplyStaked) : "0"}
            {stakedPct !== null && <span className="text-lg text-base-content/70 ml-1">({stakedPct.toFixed(1)}%)</span>}
          </div>
          {burnedFormatted && <div className="stat-desc">🔥 {burnedFormatted} burned</div>}
        </div>
      </div>

      {/* Larva CTA — unlocks at 1M clawdviction */}
      {clawdvictionScore !== null && BigInt(clawdvictionScore) >= 1_000_000n && (
        <div className="w-full max-w-lg my-4">
          <Link href="/train" className="btn btn-primary btn-lg w-full shadow-xl">
            🦞 Train Your Larva
          </Link>
        </div>
      )}

      {/* Staking Form */}
      <div className="card rounded-none bg-base-200 shadow-lg w-full max-w-lg">
        <div className="card-body">
          <h2 className="card-title">Stake Tokens</h2>
          <p className="text-sm text-base-content/60 mb-4">
            Balance: {clawdBalance ? formatClawd(clawdBalance) : "0"} CLAWD
            {clawdUsdPrice && clawdBalance && clawdBalance > 0n && (
              <span className="ml-1">(${(Number(formatEther(clawdBalance)) * clawdUsdPrice).toFixed(2)})</span>
            )}
          </p>

          <input
            type="number"
            placeholder="Amount to stake"
            className="input input-bordered rounded-none w-full"
            value={stakeAmount}
            onChange={e => setStakeAmount(e.target.value)}
          />
          <div className="flex gap-2 mb-4 mt-2">
            <button
              className="btn btn-outline btn-xs rounded-none"
              onClick={() => clawdBalance && setStakeAmount(formatEther(clawdBalance))}
              disabled={!clawdBalance || clawdBalance <= 0n}
            >
              Max
            </button>
            <button
              className="btn btn-outline btn-xs rounded-none"
              onClick={() => {
                if (!clawdBalance) return;
                const keep = parseEther("10000000");
                const amount = clawdBalance > keep ? clawdBalance - keep : 0n;
                setStakeAmount(formatEther(amount));
              }}
              disabled={!clawdBalance || clawdBalance <= 0n}
            >
              All but 10M
            </button>
          </div>

          {/* USD preview for input amount */}
          {clawdUsdPrice && parsedAmount > 0n && (
            <p className="text-sm text-base-content/50 -mt-2 mb-3">
              ≈ $
              {(Number(formatEther(parsedAmount)) * clawdUsdPrice).toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}
            </p>
          )}

          {/* Three-state flow: ONE button at a time */}
          {isWrongNetwork ? (
            <button className="btn btn-warning w-full" onClick={() => switchChain({ chainId: targetNetwork.id })}>
              ⚠️ Switch to {targetNetwork.name}
            </button>
          ) : needsApproval ? (
            <button
              className="btn btn-secondary w-full"
              onClick={handleApprove}
              disabled={isApproving || approveCooldown || parsedAmount <= 0n}
            >
              {isApproving || approveCooldown ? (
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
        <div className="card rounded-none bg-base-200 shadow-lg w-full max-w-lg mt-6">
          <div className="card-body">
            <h2 className="card-title">Your Stakes</h2>
            <div className="space-y-3">
              {activeStakesData[0].map((amount: bigint, i: number) => (
                <div key={i} className="flex items-center justify-between bg-base-100 rounded-none p-3">
                  <div>
                    <span className="font-bold">{formatClawd(amount)} CLAWD</span>
                    {clawdUsdPrice && amount > 0n && (
                      <span className="text-xs text-base-content/50 ml-1">
                        ($
                        {(Number(formatEther(amount)) * clawdUsdPrice).toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}
                        )
                      </span>
                    )}
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
