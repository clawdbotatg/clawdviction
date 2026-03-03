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
  responses?: {
    wallet: string;
    response: string;
    reasoning: string | null;
    human_override: string | null;
    human_note: string | null;
    cv_balance: number;
    created_at: string;
  }[];
  tallies?: { yes: number; no: number; abstain: number };
  userResponse?: {
    response: string;
    reasoning: string | null;
    human_override: string | null;
    human_note: string | null;
    cv_balance: number;
    created_at: string;
  } | null;
  queueStatus?: string | null;
}

export default function ProposalDetailPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const { address } = useAccount();
  const { isAuthenticated, authData } = useAuth(address);
  const [data, setData] = useState<ProposalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [annotateNote, setAnnotateNote] = useState("");
  const [annotateLoading, setAnnotateLoading] = useState(false);
  const [collectLoading, setCollectLoading] = useState(false);
  const [refetchLoading, setRefetchLoading] = useState(false);
  const [collectResults, setCollectResults] = useState<{ wallet: string; response: string }[] | null>(null);

  const isAdmin = address?.toLowerCase() === ADMIN_WALLET;

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

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, isAuthenticated, authData]);

  const handleOverride = async (vote: "yes" | "no" | "abstain") => {
    if (!authData) return;
    setOverrideLoading(true);
    try {
      await authFetch(`/api/gov/${params.id}/override`, authData, {
        method: "POST",
        body: JSON.stringify({ response: vote }),
      });
      await fetchData();
    } catch {
      /* ignore */
    }
    setOverrideLoading(false);
  };

  const handleAnnotate = async () => {
    if (!authData || !annotateNote.trim()) return;
    setAnnotateLoading(true);
    try {
      await authFetch(`/api/gov/${params.id}/annotate`, authData, {
        method: "POST",
        body: JSON.stringify({ note: annotateNote.trim() }),
      });
      setAnnotateNote("");
      await fetchData();
    } catch {
      /* ignore */
    }
    setAnnotateLoading(false);
  };

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
        <Link href="/gov" className="btn btn-ghost btn-sm rounded-none mb-4">
          ← Back to Gov
        </Link>

        <div className="card rounded-none bg-base-200 shadow-md mb-6">
          <div className="card-body">
            <div className="flex items-center gap-2 mb-2">
              <span className={`badge rounded-none ${proposal.type === "vote" ? "badge-error" : "badge-info"}`}>
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

        {/* Admin: Collect / Refetch Responses */}
        {isAdmin && isAuthenticated && (
          <div className="card rounded-none bg-base-200 shadow-md mb-6">
            <div className="card-body">
              <h2 className="text-lg font-semibold mb-3">Admin: Responses</h2>
              {collectResults ? (
                <>
                  <p className="text-sm mb-3">Processed {collectResults.length} responses:</p>
                  {collectResults.map((r, i) => (
                    <div key={i} className="flex gap-2 text-sm mb-1">
                      <span className="font-mono text-xs">
                        {r.wallet.slice(0, 6)}...{r.wallet.slice(-4)}
                      </span>
                      <span>→ {r.response}</span>
                    </div>
                  ))}
                  <button className="btn btn-ghost btn-sm rounded-none mt-3" onClick={() => setCollectResults(null)}>
                    Reset
                  </button>
                </>
              ) : (
                <div className="flex gap-3">
                  {pendingCount > 0 && (
                    <button
                      className="btn btn-primary rounded-none"
                      disabled={collectLoading || refetchLoading}
                      onClick={async () => {
                        if (!authData) return;
                        setCollectLoading(true);
                        setCollectResults(null);
                        try {
                          const res = await authFetch(`/api/gov/${params.id}/queue/trigger`, authData, {
                            method: "POST",
                            body: JSON.stringify({}),
                          });
                          const json = await res.json();
                          setCollectResults(json.results || []);
                          await fetchData();
                        } catch {
                          /* ignore */
                        }
                        setCollectLoading(false);
                      }}
                    >
                      {collectLoading ? (
                        <>
                          <span className="loading loading-spinner loading-sm" />
                          Processing {pendingCount}...
                        </>
                      ) : (
                        `Collect Responses (${pendingCount} pending)`
                      )}
                    </button>
                  )}
                  <button
                    className="btn btn-outline rounded-none"
                    disabled={collectLoading || refetchLoading}
                    onClick={async () => {
                      if (!authData) return;
                      setRefetchLoading(true);
                      setCollectResults(null);
                      try {
                        const res = await authFetch(`/api/gov/${params.id}/queue/trigger`, authData, {
                          method: "POST",
                          body: JSON.stringify({ refetch: true }),
                        });
                        const json = await res.json();
                        setCollectResults(json.results || []);
                        await fetchData();
                      } catch {
                        /* ignore */
                      }
                      setRefetchLoading(false);
                    }}
                  >
                    {refetchLoading ? (
                      <>
                        <span className="loading loading-spinner loading-sm" />
                        Regenerating...
                      </>
                    ) : (
                      "↺ Regenerate All Responses"
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Admin view: vote tallies + full responses */}
        {isAdmin && isAuthenticated && tallies && totalVotes > 0 && (
          <div className="card rounded-none bg-base-200 shadow-md mb-6">
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
                    <div className="w-full bg-base-300 rounded-none h-4">
                      <div className={`${colors[key]} h-4 rounded-none transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {isAdmin && isAuthenticated && responses && responses.length > 0 && (
          <div className="card rounded-none bg-base-200 shadow-md mb-6">
            <div className="card-body">
              <h2 className="text-lg font-semibold mb-3">All Responses</h2>
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>Wallet</th>
                      <th>CV Balance</th>
                      <th>{proposal.type === "vote" ? "Vote" : "Response"}</th>
                      {proposal.type === "vote" && <th>Override</th>}
                      {proposal.type === "vote" && <th>Reasoning</th>}
                      {proposal.type === "rfc" && <th>Human Note</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {responses.map((r, i) => (
                      <tr key={i}>
                        <td className="font-mono text-xs">
                          {r.wallet.slice(0, 6)}...{r.wallet.slice(-4)}
                        </td>
                        <td className="text-xs font-mono">{Number(r.cv_balance).toFixed(1)}</td>
                        <td className="max-w-xs truncate">{r.response}</td>
                        {proposal.type === "vote" && (
                          <td className="text-xs">{r.human_override ? r.human_override.toUpperCase() : "—"}</td>
                        )}
                        {proposal.type === "vote" && (
                          <td className="max-w-sm text-xs truncate">{r.reasoning || "—"}</td>
                        )}
                        {proposal.type === "rfc" && (
                          <td className="max-w-sm text-xs truncate">{r.human_note || "—"}</td>
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
          <div className="card rounded-none bg-base-200 shadow-md mb-6">
            <div className="card-body">
              <h2 className="text-lg font-semibold mb-3">Your Larva&apos;s Response</h2>
              {userResponse ? (
                <>
                  <div>
                    <div className="bg-primary text-primary-content px-4 py-3 whitespace-pre-wrap">
                      {userResponse.response}
                      {userResponse.reasoning && <p className="mt-2 text-sm opacity-80">{userResponse.reasoning}</p>}
                    </div>
                  </div>

                  {/* Human vote override for vote proposals */}
                  {proposal.type === "vote" && (
                    <div className="mt-4">
                      <p className="text-sm font-semibold mb-2">Override your larva&apos;s vote:</p>
                      <div className="flex gap-2">
                        {(["yes", "no", "abstain"] as const).map(vote => (
                          <button
                            key={vote}
                            className={`btn btn-sm rounded-none ${
                              userResponse.human_override === vote ? "btn-primary" : "btn-outline"
                            }`}
                            disabled={overrideLoading}
                            onClick={() => handleOverride(vote)}
                          >
                            {vote.charAt(0).toUpperCase() + vote.slice(1)}
                          </button>
                        ))}
                      </div>
                      {userResponse.human_override && (
                        <p className="text-xs text-base-content/50 mt-1">
                          Your override: <span className="font-bold">{userResponse.human_override.toUpperCase()}</span>
                        </p>
                      )}
                    </div>
                  )}

                  {/* Human annotation for RFC proposals */}
                  {proposal.type === "rfc" && (
                    <div className="mt-4">
                      {userResponse.human_note && (
                        <div className="mb-3 p-3 bg-base-300 rounded-none">
                          <p className="text-xs font-semibold mb-1">Your note:</p>
                          <p className="text-sm whitespace-pre-wrap">{userResponse.human_note}</p>
                        </div>
                      )}
                      <p className="text-sm font-semibold mb-2">Add your own note:</p>
                      <textarea
                        className="textarea textarea-bordered rounded-none w-full"
                        placeholder="Your annotation..."
                        value={annotateNote}
                        onChange={e => setAnnotateNote(e.target.value)}
                        rows={3}
                      />
                      <button
                        className="btn btn-sm btn-primary rounded-none mt-2"
                        disabled={annotateLoading || !annotateNote.trim()}
                        onClick={handleAnnotate}
                      >
                        {annotateLoading ? "Submitting..." : "Submit"}
                      </button>
                    </div>
                  )}
                </>
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
          <div className="card rounded-none bg-base-200 shadow-md">
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
