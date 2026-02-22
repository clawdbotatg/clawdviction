"use client";

import Link from "next/link";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";

const Home: NextPage = () => {
  const { isConnected } = useAccount();

  return (
    <div className="flex items-center flex-col flex-grow pt-10">
      {/* Hero */}
      <div className="px-5 text-center max-w-3xl">
        <h1 className="text-center">
          <span className="block text-6xl mb-4">🦀</span>
          <span className="block text-5xl font-bold bg-gradient-to-r from-red-500 via-red-400 to-orange-400 bg-clip-text text-transparent">
            ClawdViction
          </span>
        </h1>
        <p className="text-xl mt-4 text-base-content/70">
          AI-powered conviction governance for $CLAWD holders.
          <br />
          Stake your tokens. Train your larva. Let it govern on your behalf.
        </p>
        <div className="mt-8">
          {isConnected ? (
            <Link href="/stake" className="btn btn-primary btn-lg">
              Start Staking 🦞
            </Link>
          ) : (
            <RainbowKitCustomConnectButton />
          )}
        </div>
      </div>

      {/* How it works */}
      <div className="grid md:grid-cols-3 gap-6 mt-16 px-5 max-w-5xl w-full">
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body">
            <div className="text-3xl">🥩</div>
            <h2 className="card-title text-error">Stake $CLAWD</h2>
            <p className="text-base-content/60">
              Lock your tokens to earn ClawdViction. The longer you stake, the more governance weight you earn.
            </p>
          </div>
        </div>

        <div className="card bg-base-200 shadow-lg">
          <div className="card-body">
            <div className="text-3xl">🧠</div>
            <h2 className="card-title text-error">Train Your Larva</h2>
            <p className="text-base-content/60">
              Chat with your baby lobster. Teach it your values, preferences, and worldview through conversation.
            </p>
          </div>
        </div>

        <div className="card bg-base-200 shadow-lg">
          <div className="card-body">
            <div className="text-3xl">🗳️</div>
            <h2 className="card-title text-error">Govern Together</h2>
            <p className="text-base-content/60">
              When proposals come up, your larva debates and votes for you — informed by everything you&apos;ve taught it.
            </p>
          </div>
        </div>
      </div>

      {/* The Vision */}
      <div className="mt-16 px-5 text-center max-w-2xl mb-16">
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
  );
};

export default Home;
