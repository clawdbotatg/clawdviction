"use client";

import { useCallback, useEffect, useState } from "react";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { Address, RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useAuth } from "~~/hooks/useAuth";
import { isLiveAdmin } from "~~/lib/admins";
import { authFetch } from "~~/lib/authFetch";

const POLL_MS = 4000;
const TICKER_MS = 7000;

interface LiveArgument {
  wallet: string;
  response: string;
  larva_cv: number;
}

interface LiveCandidate {
  id: number;
  wallet: string;
  title: string;
  description: string;
  total_cv: number;
  status: string;
  created_at: string;
  aggregated_opinion_short: string | null;
  arguments: LiveArgument[];
}

interface LiveData {
  phase: "debate" | "building" | "judgment";
  chosenIdeaId: number | null;
  candidates: LiveCandidate[];
  votes: { ship: number; slop: number };
  yourVote: string | null;
}

// Auto-advancing "floor speech" feed — one larva argument at a time, rotating.
// Offset staggers the cards so the whole stage doesn't flip in unison.
const DebateTicker = ({ args, offset }: { args: LiveArgument[]; offset: number }) => {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (args.length <= 1) return;
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(
      () => {
        setIdx(i => (i + 1) % args.length);
        interval = setInterval(() => setIdx(i => (i + 1) % args.length), TICKER_MS);
      },
      TICKER_MS + offset * 2300,
    );
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [args.length, offset]);

  if (args.length === 0) {
    return (
      <div className="bg-base-300 p-4 min-h-32 flex items-center justify-center">
        <p className="text-sm text-base-content/40 italic">The larvae have not taken the floor yet...</p>
      </div>
    );
  }

  const arg = args[idx % args.length];

  return (
    <div className="bg-base-300 p-4 min-h-32 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-black tracking-widest text-error uppercase">🎙️ Floor Speech</span>
        <span className="text-[10px] font-mono text-base-content/40">
          {(idx % args.length) + 1} / {args.length}
        </span>
      </div>
      <div key={idx % args.length} className="live-speech">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">🐛</span>
          <Address address={arg.wallet} size="xs" onlyEnsOrAddress />
          {arg.larva_cv > 0 && (
            <span className="badge badge-xs badge-accent font-bold">
              {Math.floor(arg.larva_cv).toLocaleString()} CV
            </span>
          )}
        </div>
        <p className="text-sm leading-snug line-clamp-4">{arg.response}</p>
      </div>
    </div>
  );
};

const VoteBar = ({ votes }: { votes: { ship: number; slop: number } }) => {
  const total = votes.ship + votes.slop;
  const shipPct = total === 0 ? 50 : Math.round((votes.ship / total) * 100);
  return (
    <div className="w-full">
      <div className="flex justify-between text-2xl font-black mb-2">
        <span className="text-success">🚢 SHIP IT · {votes.ship}</span>
        <span className="text-error">SLOP · {votes.slop} 🗑️</span>
      </div>
      <div className="flex w-full h-10 bg-base-300 overflow-hidden">
        <div
          className="bg-success h-full transition-all duration-700 ease-out"
          style={{ width: `${total === 0 ? 50 : (votes.ship / total) * 100}%` }}
        />
        <div
          className="bg-error h-full transition-all duration-700 ease-out"
          style={{ width: `${total === 0 ? 50 : (votes.slop / total) * 100}%` }}
        />
      </div>
      <p className="text-center text-sm text-base-content/50 mt-2 font-mono">
        {total === 0
          ? "The room is silent. Cast the first vote."
          : `${shipPct}% ship · ${total} vote${total !== 1 ? "s" : ""}`}
      </p>
    </div>
  );
};

const LivePage: NextPage = () => {
  const { address } = useAccount();
  const { isAuthenticated, authData, signIn, signing } = useAuth(address);
  const isAdmin = isLiveAdmin(address);

  const [data, setData] = useState<LiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [voting, setVoting] = useState<string | null>(null);
  const [error, setError] = useState("");

  const fetchLive = useCallback(() => {
    const url = address ? `/api/live?wallet=${address.toLowerCase()}` : "/api/live";
    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (d && Array.isArray(d.candidates)) setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [address]);

  useEffect(() => {
    fetchLive();
    const interval = setInterval(fetchLive, POLL_MS);
    return () => clearInterval(interval);
  }, [fetchLive]);

  const handleControl = async (body: Record<string, unknown>) => {
    if (!authData) return;
    setActing(true);
    setError("");
    try {
      const res = await authFetch("/api/live/control", authData, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok) setError(result.error || "Control failed");
      else fetchLive();
    } catch {
      setError("Control failed");
    } finally {
      setActing(false);
    }
  };

  const handleVote = async (vote: "ship" | "slop") => {
    if (!authData) return;
    setVoting(vote);
    setError("");
    try {
      const res = await authFetch("/api/live/vote", authData, {
        method: "POST",
        body: JSON.stringify({ vote }),
      });
      const result = await res.json();
      if (!res.ok) setError(result.error || "Vote failed");
      else setData(prev => (prev ? { ...prev, votes: result.votes, yourVote: result.yourVote } : prev));
    } catch {
      setError("Vote failed");
    } finally {
      setVoting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  // First fetch failed — say so on camera instead of spinning forever. The
  // poll keeps running, so this self-heals when the API comes back.
  if (!data) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen gap-3">
        <span className="text-6xl">📴</span>
        <p className="text-3xl font-black tracking-widest">STAGE OFFLINE</p>
        <p className="text-base-content/50">Reconnecting...</p>
      </div>
    );
  }

  const { phase, chosenIdeaId, candidates, votes, yourVote } = data;
  const chosen = candidates.find(c => c.id === chosenIdeaId) ?? null;

  // Winner takes center stage once chosen
  const staged =
    chosen && candidates.length === 3
      ? [candidates.filter(c => c.id !== chosen.id)[0], chosen, candidates.filter(c => c.id !== chosen.id)[1]]
      : candidates;

  const pitch = (c: LiveCandidate) => c.description.split("\n")[0];

  // Rank by CV staked, not array position — a chosen idea that slipped out of
  // the top 3 gets prepended by the API and must not wear "#1".
  const byCv = [...candidates].sort((a, b) => b.total_cv - a.total_cv);
  const rankOf = (c: LiveCandidate) => byCv.findIndex(x => x.id === c.id) + 1;

  return (
    <div className="flex flex-col items-center min-h-screen pt-8 px-8 pb-24">
      <style>{`
        .live-speech { animation: liveSpeechIn 0.6s ease both; }
        @keyframes liveSpeechIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .live-crown { animation: liveCrownDrop 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
        @keyframes liveCrownDrop {
          from { opacity: 0; transform: translateY(-40px) scale(2); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      <div className="w-full max-w-[110rem]">
        {/* Marquee */}
        <div className="flex items-center justify-center gap-4 mb-2">
          <span className="badge badge-error badge-lg gap-2 font-black tracking-widest">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-white animate-pulse-fast"></span>
            LIVE
          </span>
          <h1 className="text-6xl font-black tracking-tight">🐛 LARVAE LIVE</h1>
        </div>
        <p className="text-center text-xl text-base-content/60 mb-6">
          {phase === "debate" && "The larvae argue their case. Clawd chooses one."}
          {phase === "building" && "Clawd has chosen. The build is underway."}
          {phase === "judgment" && "The build is done. The room judges the result."}
        </p>

        {/* Phase banner */}
        {phase === "building" && chosen && (
          <div className="bg-warning text-warning-content text-center py-3 mb-8 shadow-md">
            <span className="text-3xl font-black tracking-widest">🔨 NOW BUILDING: {chosen.title}</span>
          </div>
        )}
        {phase === "judgment" && chosen && (
          <div className="bg-primary text-primary-content text-center py-3 mb-8 shadow-md">
            <span className="text-3xl font-black tracking-widest">⚖️ THE JUDGMENT: {chosen.title}</span>
          </div>
        )}

        {/* Candidate cards */}
        {candidates.length === 0 ? (
          <p className="text-center text-base-content/60 py-24 text-2xl">No ideas on stage. Submit one in Labs.</p>
        ) : (
          <div
            className={`grid gap-8 ${staged.length === 3 ? "grid-cols-3" : staged.length === 2 ? "grid-cols-2" : "grid-cols-1 max-w-3xl mx-auto"}`}
          >
            {staged.map(c => {
              const isWinner = chosenIdeaId === c.id;
              const isLoser = chosenIdeaId !== null && !isWinner;
              const rank = rankOf(c);
              return (
                <div
                  key={c.id}
                  className={`relative card rounded-none bg-base-200 shadow-md transition-all duration-700 ${
                    isWinner ? "ring-4 ring-warning shadow-2xl scale-[1.03] z-10" : ""
                  } ${isLoser ? "opacity-30 grayscale scale-95" : ""}`}
                >
                  {isWinner && (
                    <div className="live-crown absolute -top-8 left-1/2 -translate-x-1/2 text-6xl z-20">👑</div>
                  )}
                  <div className="card-body p-6">
                    <div className="flex items-center justify-between mb-1">
                      <span className="badge badge-neutral font-mono font-bold">#{rank}</span>
                      <span className="text-3xl font-black text-accent">{c.total_cv.toLocaleString()} CV</span>
                    </div>
                    <h2 className="text-3xl font-black leading-tight min-h-[5.5rem] line-clamp-3">{c.title}</h2>
                    <p className="text-base text-base-content/70 leading-snug line-clamp-2 min-h-[2.8rem]">
                      {pitch(c)}
                    </p>
                    {c.aggregated_opinion_short && (
                      <p className="text-sm font-semibold leading-snug border-l-2 border-info pl-3 text-base-content/80 line-clamp-2">
                        🐛 {c.aggregated_opinion_short}
                      </p>
                    )}
                    <div className="flex items-center gap-2 text-sm text-base-content/50 mb-2">
                      proposed by <Address address={c.wallet} size="xs" onlyEnsOrAddress />
                    </div>
                    <DebateTicker args={c.arguments} offset={rank - 1} />
                    {isAdmin && isAuthenticated && phase === "debate" && (
                      <button
                        className="btn btn-warning btn-block mt-3 font-black tracking-widest"
                        onClick={() => handleControl({ action: "choose", ideaId: c.id })}
                        disabled={acting}
                      >
                        {acting ? <span className="loading loading-spinner loading-xs"></span> : "👑 CLAWD CHOOSES"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Judgment: the room votes */}
        {phase === "judgment" && chosen && (
          <div className="card rounded-none bg-base-200 shadow-md mt-10 max-w-4xl mx-auto">
            <div className="card-body p-8">
              <VoteBar votes={votes} />
              <div className="flex items-center justify-center gap-6 mt-6">
                {!address ? (
                  <RainbowKitCustomConnectButton />
                ) : !isAuthenticated ? (
                  <button className="btn btn-outline btn-lg" onClick={signIn} disabled={signing}>
                    {signing ? "Signing..." : "Sign in to judge"}
                  </button>
                ) : (
                  <>
                    <button
                      className={`btn btn-success btn-lg text-2xl font-black px-10 ${yourVote === "ship" ? "ring-4 ring-success/50" : yourVote ? "btn-outline" : ""}`}
                      onClick={() => handleVote("ship")}
                      disabled={voting !== null}
                    >
                      {voting === "ship" ? <span className="loading loading-spinner"></span> : "🚢 SHIP IT"}
                    </button>
                    <button
                      className={`btn btn-error btn-lg text-2xl font-black px-10 ${yourVote === "slop" ? "ring-4 ring-error/50" : yourVote ? "btn-outline" : ""}`}
                      onClick={() => handleVote("slop")}
                      disabled={voting !== null}
                    >
                      {voting === "slop" ? <span className="loading loading-spinner"></span> : "🗑️ SLOP"}
                    </button>
                  </>
                )}
              </div>
              {yourVote && (
                <p className="text-center text-sm text-base-content/50 mt-3">
                  Your verdict: {yourVote === "ship" ? "🚢 SHIP IT" : "🗑️ SLOP"} — vote again to switch sides.
                </p>
              )}
            </div>
          </div>
        )}

        {error && <p className="text-error text-center mt-4">{error}</p>}
      </div>

      {/* Admin stage controls — discreet, bottom-right */}
      {isAdmin && (
        <div className="fixed bottom-4 right-4 bg-base-200 shadow-lg border border-base-300 p-3 flex items-center gap-2 z-30">
          <span className="text-[10px] font-black tracking-widest text-base-content/40 uppercase">Stage</span>
          {!isAuthenticated ? (
            <button className="btn btn-outline btn-xs" onClick={signIn} disabled={signing}>
              {signing ? "Signing..." : "Sign in (admin)"}
            </button>
          ) : (
            <>
              {phase === "building" && (
                <button
                  className="btn btn-primary btn-xs"
                  onClick={() => handleControl({ action: "phase", phase: "judgment" })}
                  disabled={acting}
                >
                  ⚖️ Open the vote
                </button>
              )}
              {phase === "judgment" && (
                <button
                  className="btn btn-outline btn-xs"
                  onClick={() => handleControl({ action: "phase", phase: "building" })}
                  disabled={acting}
                >
                  🔨 Back to building
                </button>
              )}
              {phase !== "debate" && (
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => handleControl({ action: "reset" })}
                  disabled={acting}
                >
                  ↺ Reset stage
                </button>
              )}
              {phase === "debate" && <span className="text-xs text-base-content/50">pick a winner on a card</span>}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default LivePage;
