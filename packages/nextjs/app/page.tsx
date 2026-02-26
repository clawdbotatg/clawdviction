"use client";

import Link from "next/link";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";

const Home: NextPage = () => {
  const { isConnected } = useAccount();

  return (
    <div className="flex items-center flex-col flex-grow">
      {/* Hero — show the painting, CTA at bottom */}
      <div className="flex flex-col items-center justify-end px-5 text-center w-full" style={{ minHeight: "70vh" }}>
        <div className="pb-12">
          {isConnected ? (
            <Link href="/stake" className="btn btn-primary btn-lg shadow-xl">
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
        <div className="bg-base-100/60 backdrop-blur-sm rounded-xl px-6 py-4 text-center max-w-2xl w-full">
          <p className="text-xl text-base-content/70">
            AI-powered conviction governance for $CLAWD holders.
            <br />
            Stake your tokens. Train your larva. Let it govern on your behalf.
          </p>
        </div>

        {/* How it works */}
        <div className="grid md:grid-cols-3 gap-6 mt-8 max-w-5xl w-full">
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
                When proposals come up, your larva debates and votes for you — informed by everything you&apos;ve taught
                it.
              </p>
            </div>
          </div>
        </div>

        {/* The Vision */}
        <div className="mt-12 text-center max-w-2xl mb-16 w-full">
          <div className="bg-base-100/60 backdrop-blur-sm rounded-xl px-6 py-5">
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
      </div>
    </div>
  );
};

export default Home;
