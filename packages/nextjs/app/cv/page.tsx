"use client";

import { useCallback, useEffect, useState } from "react";
import type { NextPage } from "next";
import { Address } from "~~/components/scaffold-eth";
import { useClawdPrice } from "~~/hooks/useClawdPrice";

type Staker = {
  wallet: string;
  liveCV: number;
  stakedM: number;
};

const formatCV = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatUsd = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
};

const CVPage: NextPage = () => {
  const [stakers, setStakers] = useState<Staker[]>([]);
  const [loading, setLoading] = useState(true);
  const clawdPrice = useClawdPrice();

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/cv/leaderboard");
      if (!res.ok) return;
      const data = await res.json();
      setStakers(data.stakers);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <div className="flex flex-col items-center flex-grow pt-10 px-5">
      <div className="w-full max-w-2xl bg-base-100/60 backdrop-blur-sm rounded-none px-8 py-6">
        <h1 className="text-3xl font-bold mb-2">
          <span className="bg-gradient-to-r from-red-500 to-red-300 bg-clip-text text-transparent">CV Leaderboard</span>
        </h1>
        <p className="text-sm opacity-70 mb-6">Top Conviction Voters by earned CV</p>

        {loading ? (
          <div className="flex justify-center py-12">
            <span className="loading loading-spinner loading-lg"></span>
          </div>
        ) : stakers.length === 0 ? (
          <p className="text-center opacity-60 py-12">No stakers found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm w-full">
              <thead>
                <tr>
                  <th className="text-left">#</th>
                  <th className="text-left">Wallet</th>
                  <th className="text-right">CV Balance</th>
                  <th className="text-right">CLAWD Staked</th>
                </tr>
              </thead>
              <tbody>
                {stakers.map((s, i) => (
                  <tr key={s.wallet} className="hover">
                    <td>{i + 1}</td>
                    <td>
                      <Address address={s.wallet} />
                    </td>
                    <td className="text-right">{formatCV(s.liveCV)}</td>
                    <td className="text-right">
                      {s.stakedM.toFixed(2)} M
                      {clawdPrice > 0 && (
                        <span className="text-base-content/50"> ({formatUsd(s.stakedM * 1_000_000 * clawdPrice)})</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default CVPage;
