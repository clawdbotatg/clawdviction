"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { Address, RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useAuth } from "~~/hooks/useAuth";
import { authFetch } from "~~/lib/authFetch";

const ADMIN_WALLET = "0x11ce532845ce0eacda41f72fdc1c88c335981442";

/** Strip trailing markdown bold artifacts (e.g. "**") from AI-generated reasoning */
const cleanReasoning = (text: string | null | undefined): string | null => {
  if (!text) return null;
  return text.replace(/\*{2,}\s*$/, "").trimEnd();
};

interface ProposalData {
  proposal: {
    id: number;
    type: string;
    title: string;
    question: string;
    created_by: string;
    created_at: string;
    status: string;
    aggregated_opinion?: string | null;
    aggregated_opinion_short?: string | null;
    options?: string[] | null;
    closes_at?: string | null;
    duration_hours?: number | null;
  };
  responseCount: number;
  pendingCount: number;
  responses?: {
    wallet: string;
    response: string;
    reasoning: string | null;
    human_override: string | null;
    human_note: string | null;
    chosen_option: string | null;
    cv_committed: number | null;
    cv_balance: number;
    created_at: string;
  }[];
  tallies?: Record<string, number>;
  cvTotals?: Record<string, number>;
  quadraticTotals?: Record<string, number>;
  userResponse?: {
    response: string;
    reasoning: string | null;
    human_override: string | null;
    human_note: string | null;
    chosen_option: string | null;
    cv_committed: number | null;
    cv_balance: number;
    created_at: string;
  } | null;
  queueStatus?: string | null;
  larvaResponses?: {
    wallet: string;
    response: string;
    chosen_option: string | null;
    reasoning: string | null;
    created_at: string;
  }[];
}

const timeAgo = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return `${Math.floor(diff / 60000)}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

function TimeRemaining({ closesAt }: { closesAt: string }) {
  const [label, setLabel] = useState("");

  useEffect(() => {
    const update = () => {
      const now = Date.now();
      const end = new Date(closesAt).getTime();
      const diff = end - now;
      if (diff <= 0) {
        setLabel("Voting closed");
        return;
      }
      const hours = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      if (hours > 0) {
        setLabel(`${hours}h ${mins}m remaining`);
      } else {
        setLabel(`${mins}m remaining`);
      }
    };
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [closesAt]);

  if (!label) return null;
  const isClosed = label === "Voting closed";
  return (
    <span className={`badge badge-sm rounded-none ${isClosed ? "badge-ghost" : "badge-warning"}`}>⏰ {label}</span>
  );
}

export default function ProposalDetailPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const { address } = useAccount();
  const { isAuthenticated, authData, signIn, signing } = useAuth(address);
  const [data, setData] = useState<ProposalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [annotateNote, setAnnotateNote] = useState("");
  const [annotateLoading, setAnnotateLoading] = useState(false);
  const [collectLoading, setCollectLoading] = useState(false);
  const [collectMissingLoading, setCollectMissingLoading] = useState(false);
  const [refetchLoading, setRefetchLoading] = useState(false);
  const [collectResults, setCollectResults] = useState<{ wallet: string; response: string }[] | null>(null);
  const [aggregateLoading, setAggregateLoading] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [cvAmount, setCvAmount] = useState<string>("100000");

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

  const hasOptions =
    data?.proposal?.options && Array.isArray(data.proposal.options) && data.proposal.options.length > 0;
  const isMultiOptionVote = data?.proposal?.type === "vote" && hasOptions;
  const isLegacyVote = data?.proposal?.type === "vote" && !hasOptions;

  const handleOverride = async (vote: string) => {
    if (!authData) return;
    setOverrideLoading(true);
    try {
      if (isMultiOptionVote) {
        await authFetch(`/api/gov/${params.id}/override`, authData, {
          method: "POST",
          body: JSON.stringify({
            chosen_option: vote,
            cv_committed: parseInt(cvAmount) || 100000,
          }),
        });
      } else {
        await authFetch(`/api/gov/${params.id}/override`, authData, {
          method: "POST",
          body: JSON.stringify({ response: vote }),
        });
      }
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

  const {
    proposal,
    responseCount,
    pendingCount,
    responses,
    tallies,
    cvTotals,
    quadraticTotals,
    userResponse,
    queueStatus,
    larvaResponses,
  } = data;

  // Compute total votes for bar widths
  const totalVotes = tallies ? Object.values(tallies).reduce((a, b) => a + b, 0) : 0;
  const totalCv = cvTotals ? Object.values(cvTotals).reduce((a, b) => a + b, 0) : 0;
  const totalQp = quadraticTotals ? Object.values(quadraticTotals).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="flex flex-col items-center min-h-screen pt-10 px-4">
      <div className="w-full max-w-3xl">
        <Link href="/gov" className="btn btn-ghost btn-sm rounded-none mb-4">
          ← Back to Gov
        </Link>

        {/* Proposal Header */}
        <div className="card rounded-none bg-base-200 shadow-md mb-6">
          <div className="card-body">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`badge rounded-none ${proposal.type === "vote" ? "badge-error" : "badge-info"}`}>
                {proposal.type.toUpperCase()}
              </span>
              {isMultiOptionVote && (
                <span className="badge badge-sm rounded-none badge-outline">{proposal.options!.length} options</span>
              )}
              {proposal.closes_at && <TimeRemaining closesAt={proposal.closes_at} />}
              <span className="text-sm text-base-content/50">{new Date(proposal.created_at).toLocaleDateString()}</span>
            </div>
            <h1 className="text-2xl font-bold">{proposal.title}</h1>
            <p className="mt-2 whitespace-pre-wrap">{proposal.question}</p>

            {/* Show options summary for multi-option votes */}
            {isMultiOptionVote && (
              <div className="mt-4 space-y-2">
                {proposal.options!.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-3 text-sm bg-base-300 px-3 py-2">
                    <span className="font-mono font-bold min-w-[1.5rem]">{idx + 1}.</span>
                    <span className="flex-1">{opt}</span>
                  </div>
                ))}
              </div>
            )}

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
                <div className="flex gap-3 flex-wrap">
                  <button
                    className="btn btn-outline btn-sm rounded-none"
                    disabled={collectMissingLoading || collectLoading || refetchLoading}
                    onClick={async () => {
                      if (!authData) return;
                      setCollectMissingLoading(true);
                      try {
                        const res = await authFetch(`/api/gov/${params.id}/collect`, authData, {
                          method: "POST",
                        });
                        const json = await res.json();
                        if (json.queued > 0) {
                          alert(`Queued ${json.queued} new responses`);
                        } else {
                          alert("All larvae have already responded");
                        }
                        await fetchData();
                      } catch {
                        alert("Error collecting responses");
                      }
                      setCollectMissingLoading(false);
                    }}
                  >
                    {collectMissingLoading ? (
                      <>
                        <span className="loading loading-spinner loading-sm" />
                        Collecting...
                      </>
                    ) : (
                      "+ Collect Responses"
                    )}
                  </button>
                  {pendingCount > 0 && (
                    <button
                      className="btn btn-primary rounded-none"
                      disabled={collectLoading || refetchLoading || collectMissingLoading}
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

        {/* Vote Tallies — Multi-option */}
        {isMultiOptionVote &&
          tallies &&
          totalVotes > 0 &&
          (() => {
            const isClosed = proposal.closes_at && new Date(proposal.closes_at).getTime() < Date.now();
            const qpWinnerOpt = proposal.options!.reduce(
              (best, opt) => ((quadraticTotals?.[opt] || 0) > (quadraticTotals?.[best] || 0) ? opt : best),
              proposal.options![0],
            );
            const qpWinnerQp = quadraticTotals?.[qpWinnerOpt] || 0;
            const qpWinnerPct = totalQp > 0 ? ((qpWinnerQp / totalQp) * 100).toFixed(1) : "0.0";

            return (
              <div className="card rounded-none bg-base-200 shadow-md mb-6">
                <div className="card-body">
                  <h2 className="text-lg font-semibold mb-3">{isClosed ? "📊 Final Results" : "📊 Vote Tallies"}</h2>

                  {/* Winner declaration */}
                  {isClosed && totalVotes > 0 && (
                    <div className="mb-4 p-3 bg-base-300 border-l-4 border-primary">
                      <p className="font-bold">
                        🏆 Winner: &ldquo;{qpWinnerOpt}&rdquo; — {Math.round(qpWinnerQp).toLocaleString()} QP (
                        {qpWinnerPct}%)
                      </p>
                      <p
                        className="text-xs text-base-content/50 mt-1"
                        title="QP = √CV per voter, summed — reduces whale dominance"
                      >
                        QP = √CV per voter, summed — reduces whale dominance
                      </p>
                    </div>
                  )}

                  {proposal.options!.map((opt, idx) => {
                    const count = tallies[opt] || 0;
                    const cv = cvTotals?.[opt] || 0;
                    const qp = quadraticTotals?.[opt] || 0;
                    const qpPct = totalQp > 0 ? (qp / totalQp) * 100 : 0;
                    const colors = ["bg-primary", "bg-secondary", "bg-accent", "bg-info", "bg-success", "bg-warning"];
                    const barColor = colors[idx % colors.length];
                    return (
                      <div key={idx} className="mb-3">
                        <div className="text-sm mb-1">
                          <span className="font-bold">{opt}</span>
                          <div className="flex gap-3 text-base-content/70 flex-wrap">
                            <span>
                              {count} vote{count !== 1 ? "s" : ""}
                            </span>
                            <span>·</span>
                            <span>{cv.toLocaleString()} CV</span>
                            <span>·</span>
                            <span>
                              ⚡ {Math.round(qp).toLocaleString()} QP ({qpPct.toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                        <div className="w-full bg-base-300 h-4">
                          <div className={`${barColor} h-4 transition-all`} style={{ width: `${qpPct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  {totalQp > 0 && (
                    <p
                      className="text-sm text-base-content/50 mt-2"
                      title="QP = √CV per voter, summed — reduces whale dominance"
                    >
                      Total: {totalCv.toLocaleString()} CV · {Math.round(totalQp).toLocaleString()} QP
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

        {/* Vote Tallies — Legacy yes/no/abstain */}
        {isLegacyVote && tallies && totalVotes > 0 && (
          <div className="card rounded-none bg-base-200 shadow-md mb-6">
            <div className="card-body">
              <h2 className="text-lg font-semibold mb-3">
                {proposal.closes_at && new Date(proposal.closes_at).getTime() < Date.now()
                  ? "📊 Final Results"
                  : "📊 Vote Tallies"}
              </h2>
              {(["yes", "no", "abstain"] as const).map(key => {
                const count = (tallies as Record<string, number>)[key] || 0;
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

        {/* How Larvas Are Thinking — Vote proposals, public */}
        {(isMultiOptionVote || isLegacyVote) &&
          larvaResponses &&
          larvaResponses.length > 0 &&
          (() => {
            // Group responses by their effective option
            const grouped: Record<string, typeof larvaResponses> = {};
            for (const lr of larvaResponses) {
              // Skip the current user's own response
              if (address && lr.wallet.toLowerCase() === address.toLowerCase()) continue;
              const key = isMultiOptionVote ? lr.chosen_option || lr.response || "Unknown" : lr.response || "Unknown";
              if (!grouped[key]) grouped[key] = [];
              grouped[key].push(lr);
            }

            // For each option, pick 2-3 sample reasoning snippets
            const optionKeys = isMultiOptionVote && proposal.options ? proposal.options : Object.keys(grouped);

            const hasAnyReasoning = Object.values(grouped).some(entries =>
              entries.some(e => e.reasoning && e.reasoning.trim().length > 0),
            );

            if (!hasAnyReasoning) return null;

            return (
              <div className="card rounded-none bg-base-200 shadow-md mb-6">
                <div className="card-body">
                  <h2 className="text-lg font-semibold mb-3">🐛 How Larvas Are Thinking</h2>
                  <div className="space-y-4">
                    {optionKeys.map(opt => {
                      const entries = grouped[opt] || [];
                      const withReasoning = entries.filter(e => e.reasoning && e.reasoning.trim().length > 0);
                      if (withReasoning.length === 0) return null;
                      const samples = withReasoning.slice(0, 3);
                      return (
                        <div key={opt}>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="badge badge-sm rounded-none badge-outline">{opt}</span>
                            <span className="text-xs text-base-content/50">
                              {entries.length} vote{entries.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <div className="space-y-2 ml-2 border-l-2 border-base-content/10 pl-3">
                            {samples.map((s, i) => (
                              <div key={i} className="text-sm">
                                <div className="flex items-center gap-2 text-xs text-base-content/40 mb-0.5">
                                  <span className="inline-flex items-center gap-1">
                                    🐛 <Address address={s.wallet} size="xs" />
                                  </span>
                                </div>
                                <p className="text-base-content/80 whitespace-pre-wrap">
                                  {cleanReasoning(s.reasoning)}
                                </p>
                              </div>
                            ))}
                            {withReasoning.length > 3 && (
                              <p className="text-xs text-base-content/40">
                                + {withReasoning.length - 3} more perspective{withReasoning.length - 3 !== 1 ? "s" : ""}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}

        {/* Aggregated opinion — visible to everyone if it exists, admin can generate */}
        {(proposal.aggregated_opinion || (isAdmin && isAuthenticated && responseCount > 0)) && (
          <div className="card rounded-none bg-base-200 shadow-md mb-6">
            <div className="card-body">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">
                  {proposal.type === "vote" ? "⚖️ Ruling" : "🧠 Aggregated Opinion"}
                </h2>
                {isAdmin && isAuthenticated && (
                  <button
                    className="btn btn-sm btn-outline rounded-none"
                    disabled={aggregateLoading}
                    onClick={async () => {
                      if (!authData) return;
                      setAggregateLoading(true);
                      try {
                        await authFetch(`/api/gov/${params.id}/aggregate`, authData, { method: "POST" });
                        await fetchData();
                      } catch {
                        /* ignore */
                      }
                      setAggregateLoading(false);
                    }}
                  >
                    {aggregateLoading ? (
                      <>
                        <span className="loading loading-spinner loading-sm" />
                        Synthesizing...
                      </>
                    ) : proposal.aggregated_opinion ? (
                      "↺ Regenerate"
                    ) : (
                      "✨ Form Aggregated Opinion"
                    )}
                  </button>
                )}
              </div>
              {proposal.aggregated_opinion ? (
                <>
                  <p className="whitespace-pre-wrap text-base-content">{proposal.aggregated_opinion}</p>
                  {proposal.aggregated_opinion_short && (
                    <div className="mt-4 pt-4 border-t border-base-content/10">
                      <p className="text-lg font-semibold text-error">{proposal.aggregated_opinion_short}</p>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-base-content/50 text-sm">
                  No ruling yet. Hit the button to synthesize all responses.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Admin: All Responses Table */}
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
                      <th>{isMultiOptionVote ? "Option" : proposal.type === "vote" ? "Vote" : "Response"}</th>
                      {proposal.type === "vote" && <th>Override</th>}
                      {isMultiOptionVote && <th>CV Committed</th>}
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
                        <td className="text-xs font-mono">{Math.floor(Number(r.cv_balance)).toLocaleString()}</td>
                        <td className="max-w-xs truncate">
                          {isMultiOptionVote ? r.chosen_option || r.response : r.response}
                        </td>
                        {proposal.type === "vote" && (
                          <td className="text-xs">{r.human_override ? r.human_override.toUpperCase() : "—"}</td>
                        )}
                        {isMultiOptionVote && (
                          <td className="text-xs font-mono">
                            {r.cv_committed ? r.cv_committed.toLocaleString() : "—"}
                          </td>
                        )}
                        {proposal.type === "vote" && (
                          <td className="max-w-sm text-xs truncate">
                            {r.reasoning ? (
                              cleanReasoning(r.reasoning)
                            ) : (
                              <span className="italic text-base-content/40">No reasoning provided</span>
                            )}
                          </td>
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
                      {isMultiOptionVote && userResponse.chosen_option ? (
                        <>
                          <span className="font-bold text-lg">{userResponse.chosen_option.toUpperCase()}</span>
                          {userResponse.cv_committed && (
                            <span className="ml-2 text-sm opacity-80">
                              ({userResponse.cv_committed.toLocaleString()} CV committed)
                            </span>
                          )}
                        </>
                      ) : (
                        userResponse.response
                      )}
                      {userResponse.reasoning && (
                        <p className="mt-2 text-sm opacity-80">{cleanReasoning(userResponse.reasoning)}</p>
                      )}
                    </div>
                  </div>

                  {/* Human override: multi-option vote */}
                  {isMultiOptionVote && (
                    <div className="mt-4">
                      <p className="text-sm font-semibold mb-2">Override your larva&apos;s vote:</p>
                      <div className="space-y-2 mb-3">
                        {proposal.options!.map((opt, idx) => {
                          const effectiveChoice = userResponse.human_override || userResponse.chosen_option;
                          const isSelected = selectedOption === opt || (!selectedOption && effectiveChoice === opt);
                          return (
                            <button
                              key={idx}
                              className={`w-full text-left px-4 py-3 border transition-all ${
                                isSelected
                                  ? "border-primary bg-primary/10"
                                  : "border-base-content/20 hover:border-base-content/40"
                              }`}
                              disabled={overrideLoading}
                              onClick={() => setSelectedOption(opt)}
                            >
                              <span className="font-bold">{opt}</span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="form-control flex-1">
                          <label className="label py-1">
                            <span className="label-text text-xs">CV to commit</span>
                          </label>
                          <input
                            type="number"
                            className="input input-bordered input-sm rounded-none w-full"
                            value={cvAmount}
                            onChange={e => setCvAmount(e.target.value)}
                            min="0"
                          />
                        </div>
                        <button
                          className="btn btn-primary btn-sm rounded-none mt-6"
                          disabled={overrideLoading || !selectedOption}
                          onClick={() => {
                            if (selectedOption) handleOverride(selectedOption);
                          }}
                        >
                          {overrideLoading ? (
                            <>
                              <span className="loading loading-spinner loading-sm" />
                              Submitting...
                            </>
                          ) : (
                            "Submit Override"
                          )}
                        </button>
                      </div>

                      {userResponse.human_override && (
                        <p className="text-xs text-base-content/50 mt-2">
                          Your current override:{" "}
                          <span className="font-bold">{userResponse.human_override.toUpperCase()}</span>
                          {userResponse.cv_committed && <span> · {userResponse.cv_committed.toLocaleString()} CV</span>}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Human override: legacy yes/no/abstain vote */}
                  {isLegacyVote && (
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

        {/* Larva Perspectives — RFC only, public */}
        {proposal.type === "rfc" && larvaResponses && larvaResponses.length > 0 && (
          <div className="card rounded-none bg-base-200 shadow-md mb-6">
            <div className="card-body">
              <h2 className="text-lg font-semibold mb-3">
                {"🐛 Larva Perspectives (" +
                  (address
                    ? larvaResponses.filter(lr => lr.wallet.toLowerCase() !== address.toLowerCase()).length
                    : larvaResponses.length) +
                  ")"}
              </h2>
              <div className="space-y-2">
                {larvaResponses
                  .filter(lr => !address || lr.wallet.toLowerCase() !== address.toLowerCase())
                  .map((lr, i) => (
                    <div key={i} className="card rounded-none bg-base-300">
                      <div className="card-body py-3 px-4">
                        <div className="flex items-center gap-2 text-xs text-base-content/50 mb-1">
                          <span className="inline-flex items-center gap-1">
                            🐛 <Address address={lr.wallet} size="xs" />
                          </span>
                          <span>·</span>
                          <span>{timeAgo(lr.created_at)}</span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{lr.response}</p>
                        {lr.reasoning && (
                          <p className="text-xs text-base-content/60 mt-1 whitespace-pre-wrap">
                            {cleanReasoning(lr.reasoning)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                {address &&
                  larvaResponses.filter(lr => lr.wallet.toLowerCase() !== address.toLowerCase()).length === 0 && (
                    <p className="text-sm text-base-content/50">No other responses yet.</p>
                  )}
              </div>
            </div>
          </div>
        )}
        {proposal.type === "rfc" && (!larvaResponses || larvaResponses.length === 0) && (
          <div className="card rounded-none bg-base-200 shadow-md mb-6">
            <div className="card-body">
              <h2 className="text-lg font-semibold mb-3">🐛 Larva Perspectives (0)</h2>
              <p className="text-sm text-base-content/50">No responses yet.</p>
            </div>
          </div>
        )}

        {/* Not connected */}
        {!address && (
          <div className="card rounded-none bg-base-200 shadow-md">
            <div className="card-body items-center text-center">
              <p className="mb-3">Connect your wallet to see your larva&apos;s response</p>
              <RainbowKitCustomConnectButton />
            </div>
          </div>
        )}

        {/* Connected but not signed in */}
        {address && !isAuthenticated && (
          <div className="card rounded-none bg-base-200 shadow-md">
            <div className="card-body items-center text-center">
              <p className="mb-3">Sign in to see your larva&apos;s response</p>
              <button className="btn btn-primary rounded-none" disabled={signing} onClick={signIn}>
                {signing ? (
                  <>
                    <span className="loading loading-spinner loading-sm" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
