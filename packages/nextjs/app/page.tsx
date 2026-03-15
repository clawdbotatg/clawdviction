"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { Address } from "~~/components/scaffold-eth";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";

function formatStat(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toFixed(0);
}

const Home: NextPage = () => {
  const { isConnected } = useAccount();
  const { data: stakingContractData } = useDeployedContractInfo("ClawdVictionStaking");
  const [stats, setStats] = useState<{ totalStakedClawd: number; totalCvGenerated: number } | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then(res => res.json())
      .then(data => {
        if (data.totalStakedClawd !== undefined) setStats(data);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex items-center flex-col flex-grow">
      {/* Hero — show the painting, CTA at bottom */}
      <div className="flex flex-col items-center justify-end px-5 text-center w-full" style={{ minHeight: "70vh" }}>
        <div className="pb-[168px]">
          {isConnected ? (
            <Link href="/stake" className="btn btn-primary btn-lg shadow-xl text-xl px-10 py-4 h-auto">
              Start Staking 🦞
            </Link>
          ) : (
            <RainbowKitCustomConnectButton />
          )}
        </div>
      </div>

      {/* Below fold — subtitle + cards + vision */}
      <div className="flex flex-col items-center w-full px-5">
        {/* Subtitle */}
        <div className="bg-base-100/60 backdrop-blur-sm rounded-none px-6 py-4 text-center max-w-2xl w-full">
          <p className="text-xl text-base-content/70">
            AI-powered conviction governance for $CLAWD holders.
            <br />
            Stake your tokens. Train your larva. Let it govern on your behalf.
          </p>
        </div>

        {/* How it works */}
        <div className="grid md:grid-cols-3 gap-6 mt-8 max-w-5xl w-full">
          <div className="card rounded-none bg-base-200 shadow-lg">
            <div className="card-body">
              <div className="text-3xl">🥩</div>
              <h2 className="card-title text-error">Stake $CLAWD</h2>
              <p className="text-base-content/60">
                Lock your tokens to earn conviction. The longer you stake, the more governance weight you earn.
              </p>
            </div>
          </div>

          <div className="card rounded-none bg-base-200 shadow-lg">
            <div className="card-body">
              <div className="text-3xl">🧠</div>
              <h2 className="card-title text-error">Train Your Larva</h2>
              <p className="text-base-content/60">
                Chat with your baby lobster. Teach it your values, preferences, and worldview through conversation.
              </p>
            </div>
          </div>

          <div className="card rounded-none bg-base-200 shadow-lg">
            <div className="card-body">
              <div className="text-3xl">🗳️</div>
              <h2 className="card-title text-error">Govern Together</h2>
              <p className="text-base-content/60">
                When proposals come up, your larva debates and votes for you — informed by everything you&apos;ve taught
                it.
              </p>
            </div>
          </div>
        </div>

        {/* The Vision */}
        <div className="mt-12 text-center max-w-2xl mb-8 w-full">
          <div className="bg-base-100/60 backdrop-blur-sm rounded-none px-6 py-5">
            <h2 className="text-2xl font-bold">The Problem</h2>
            <p className="mt-4 text-base-content/60">
              DAOs fail because nobody has time to be informed on everything. Delegation just creates mini-oligarchies.
              What if you could train an AI to represent <em>your</em> values in every vote?
            </p>
            <Link href="/about" className="link link-error mt-4 inline-block">
              Read the full vision →
            </Link>
          </div>
        </div>

        {/* Protocol Stats */}
        {stats && (
          <div className="flex flex-row gap-4 mt-6 mb-6 justify-center w-full max-w-2xl">
            <div className="bg-base-200 rounded-none px-6 py-3 flex-1 max-w-sm text-center">
              <p className="text-base-content/40 text-xs uppercase tracking-widest">Total Staked</p>
              <p className="text-error font-bold text-xl">{formatStat(stats.totalStakedClawd)} $CLAWD</p>
            </div>
            <div className="bg-base-200 rounded-none px-6 py-3 flex-1 max-w-sm text-center">
              <p className="text-base-content/40 text-xs uppercase tracking-widest">CV Generated</p>
              <p className="text-error font-bold text-xl">{formatStat(stats.totalCvGenerated)} CV</p>
            </div>
          </div>
        )}

        {/* Contract Address */}
        {stakingContractData?.address && (
          <div className="mb-16 text-center flex flex-col items-center gap-3">
            <p className="text-xs text-base-content/40 uppercase tracking-widest">Staking Contract</p>
            <Address address={stakingContractData.address} />
            <a
              href="https://github.com/clawdbotatg/clawdviction/blob/main/skill.md"
              target="_blank"
              rel="noreferrer"
              className="btn btn-outline btn-sm font-normal gap-1 mt-2"
            >
              🤖 Give this skill to your agent
            </a>
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;
