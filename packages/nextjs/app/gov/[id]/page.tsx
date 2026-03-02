"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useAuth } from "~~/hooks/useAuth";
import { authFetch } from "~~/lib/authFetch";

const ADMIN_WALLET = "0x11ce532845ce0eacda41f72fdc1c88c335981442";

interface ProposalData {
  proposal: {
    id: number;
    type: string;
    title: string;
    question: string;
    created_by: string;
    created_at: string;
    status: string;
  };
  responseCount: number;
  pendingCount: number;
  responses?: { wallet: string; response: string; reasoning: string | null; created_at: string }[];
  tallies?: { yes: number; no: number; abstain: number };
  userResponse?: { response: string; reasoning: string | null; created_at: string } | null;
  queueStatus?: string | null;
}

export default function ProposalDetailPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const { address } = useAccount();
  const { isAuthenticated, authData } = useAuth(address);
  const [data, setData] = useState<ProposalData | null>(null);
  const [loading, setLoading] = useState(true);

  const isAdmin = address?.toLowerCase() === ADMIN_WALLET;

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = isAuthenticated
          ? await authFetch(`/api/gov/${params.id}`, authData)
          : await fetch(`/api/gov/${params.id}`);
        const json = await res.json();
        setData(json);
      } catch {
        /* ignore */
      }
      setLoading(false);
    };
    fetchData();
  }, [params.id, isAuthenticated, authData]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  if (!data?.proposal) {
    return <div className="text-center py-20">Proposal not found.</div>;
  }

  const { proposal, responseCount, pendingCount, responses, tallies, userResponse, queueStatus } = data;
  const totalVotes = tallies ? tallies.yes + tallies.no + tallies.abstain : 0;

  return (
    <div className="flex flex-col items-center min-h-screen pt-10 px-4">
      <div className="w-full max-w-3xl">
        <Link href="/gov" className="btn btn-ghost btn-sm mb-4">
          ← Back to Gov
        </Link>

        <div className="card bg-base-200 shadow-md mb-6">
          <div className="card-body">
            <div className="flex items-center gap-2 mb-2">
              <span className={`badge ${proposal.type === "vote" ? "badge-error" : "badge-info"}`}>
                {proposal.type.toUpperCase()}
              </span>
              <span className="text-sm text-base-content/50">{new Date(proposal.created_at).toLocaleDateString()}</span>
            </div>
            <h1 className="text-2xl font-bold">{proposal.title}</h1>
            <p className="mt-2 whitespace-pre-wrap">{proposal.question}</p>
            <p className="text-sm text-base-content/50 mt-3">
              {responseCount} response{responseCount !== 1 ? "s" : ""}
              {pendingCount > 0 && ` · ${pendingCount} pending`}
            </p>
          </div>
        </div>

        {/* Admin view: vote tallies + full responses */}
        {isAdmin && isAuthenticated && tallies && totalVotes > 0 && (
          <div className="card bg-base-200 shadow-md mb-6">
            <div className="card-body">
              <h2 className="text-lg font-semibold mb-3">Vote Tallies</h2>
              {(["yes", "no", "abstain"] as const).map(key => {
                const count = tallies[key];
                const pct = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
                const colors = { yes: "bg-success", no: "bg-error", abstain: "bg-warning" };
                return (
                  <div key={key} className="mb-2">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="capitalize">{key}</span>
                      <span>
                        {count} ({pct.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="w-full bg-base-300 rounded-full h-4">
                      <div className={`${colors[key]} h-4 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {isAdmin && isAuthenticated && responses && responses.length > 0 && (
          <div className="card bg-base-200 shadow-md mb-6">
            <div className="card-body">
              <h2 className="text-lg font-semibold mb-3">All Responses</h2>
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>Wallet</th>
                      <th>{proposal.type === "vote" ? "Vote" : "Response"}</th>
                      {proposal.type === "vote" && <th>Reasoning</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {responses.map((r, i) => (
                      <tr key={i}>
                        <td className="font-mono text-xs">
                          {r.wallet.slice(0, 6)}...{r.wallet.slice(-4)}
                        </td>
                        <td className="max-w-xs truncate">{r.response}</td>
                        {proposal.type === "vote" && (
                          <td className="max-w-sm text-xs truncate">{r.reasoning || "—"}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Regular user view */}
        {!isAdmin && isAuthenticated && (
          <div className="card bg-base-200 shadow-md mb-6">
            <div className="card-body">
              <h2 className="text-lg font-semibold mb-3">Your Larva&apos;s Response</h2>
              {userResponse ? (
                <div className="chat chat-start">
                  <div className="chat-bubble chat-bubble-primary whitespace-pre-wrap">
                    {userResponse.response}
                    {userResponse.reasoning && <p className="mt-2 text-sm opacity-80">{userResponse.reasoning}</p>}
                  </div>
                </div>
              ) : queueStatus === "pending" || queueStatus === "processing" ? (
                <div className="text-center py-4">
                  <span className="loading loading-dots loading-md"></span>
                  <p className="mt-2">Your larva is thinking... 🦞</p>
                </div>
              ) : (
                <p className="text-base-content/60">No response yet.</p>
              )}
            </div>
          </div>
        )}

        {/* Not connected */}
        {!isAuthenticated && (
          <div className="card bg-base-200 shadow-md">
            <div className="card-body items-center text-center">
              <p className="mb-3">Connect your wallet to see your larva&apos;s response</p>
              <RainbowKitCustomConnectButton />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
