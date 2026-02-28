"use client";

import { useCallback, useEffect, useState } from "react";
import { Address, formatUnits } from "viem";
import { base } from "viem/chains";
import { useReadContract } from "wagmi";

const CLAWD_TOKEN = "0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07" as const;

const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

function abbreviate(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num) || num === 0) return "0";
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  if (num >= 1) return num.toFixed(1);
  return num.toPrecision(3);
}

export const WalletStats = ({ address }: { address: Address }) => {
  const [cvBase, setCvBase] = useState<string | null>(null);
  const [cvAccrualRate, setCvAccrualRate] = useState<number>(0);
  const [cvFetchedAt, setCvFetchedAt] = useState<number>(0);
  const [liveCv, setLiveCv] = useState<string | null>(null);

  const { data: clawdBalance } = useReadContract({
    address: CLAWD_TOKEN,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address],
    chainId: base.id,
  });

  const fetchCv = useCallback(async () => {
    try {
      const res = await fetch(`/api/clawdviction/${address}`);
      const data = await res.json();
      setCvBase(data.clawdviction ?? "0");
      if (data.accrualRate != null) setCvAccrualRate(data.accrualRate);
      setCvFetchedAt(Date.now());
    } catch {
      // ignore
    }
  }, [address]);

  useEffect(() => {
    fetchCv();
    const id = setInterval(fetchCv, 30000);
    return () => clearInterval(id);
  }, [fetchCv]);

  // Tick CV live
  useEffect(() => {
    if (cvBase === null || !cvFetchedAt) return;
    const tick = () => {
      const elapsedSec = (Date.now() - cvFetchedAt) / 1000;
      const baseVal = BigInt(cvBase);
      const pending = BigInt(Math.floor(cvAccrualRate * elapsedSec));
      setLiveCv((baseVal + pending).toString());
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [cvBase, cvAccrualRate, cvFetchedAt]);

  const clawdFormatted = clawdBalance != null ? abbreviate(formatUnits(clawdBalance, 18)) : "…";
  const cvFormatted = liveCv != null ? abbreviate(formatUnits(BigInt(liveCv), 18)) : "…";

  return (
    <div className="absolute top-full right-0 mt-1 z-50">
      <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-base-300/90 shadow-lg text-xs whitespace-nowrap backdrop-blur-sm">
        <span>🦞 {cvFormatted} CV</span>
        <span className="opacity-40">|</span>
        <span>🦀 {clawdFormatted} $CLAWD</span>
      </div>
    </div>
  );
};
