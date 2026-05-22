"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { Address, RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useAuth } from "~~/hooks/useAuth";
import { authFetch } from "~~/lib/authFetch";

const FORUM_STAKE_MIN = 100_000;

interface PostData {
  post: {
    id: number;
    wallet: string;
    title: string;
    body: string;
    cv_burned: number;
    total_cv: number;
    larva_triggered: boolean;
    aggregated_opinion: string | null;
    aggregated_opinion_short: string | null;
    created_at: string;
  };
  replies: {
    id: number;
    wallet: string;
    body: string;
    cv_burned: number;
    created_at: string;
  }[];
  stakes: {
    wallet: string;
    cv_amount: number;
    created_at: string;
  }[];
  larvaResponseCount: number;
  larvaPendingCount: number;
  larvaResponses: {
    wallet: string;
    response: string;
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

export default function ForumPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { address } = useAccount();
  const { isAuthenticated, authData, signIn, signing } = useAuth(address);

  const [data, setData] = useState<PostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyBody, setReplyBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [stakeAmount, setStakeAmount] = useState("");
  const [staking, setStaking] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState("");

  const fetchBalance = () => {
    if (!address) return;
    fetch(`/api/clawdviction/${address.toLowerCase()}`)
      .then(r => r.json())
      .then(d => {
        if (d.balance !== undefined) setBalance(parseFloat(d.balance));
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const fetchPost = () => {
    fetch(`/api/forum/${id}`)
      .then(r => r.json())
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchPost();
  }, [id]);

  const isOP = data && address?.toLowerCase() === data.post.wallet;

  const handleReply = async () => {
    if (!replyBody.trim() || !authData) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await authFetch(`/api/forum/${id}/reply`, authData, {
        method: "POST",
        body: JSON.stringify({ body: replyBody }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || "Failed to reply");
      } else {
        setReplyBody("");
        fetchPost();
      }
    } catch {
      setError("Failed to reply");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStake = async () => {
    if (!authData) return;
    const amount = parseInt(stakeAmount);
    if (isNaN(amount) || amount < FORUM_STAKE_MIN) return;
    setStaking(true);
    setError("");
    try {
      const res = await authFetch(`/api/forum/${id}/stake`, authData, {
        method: "POST",
        body: JSON.stringify({ cv_amount: amount }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || "Failed to stake");
      } else {
        setStakeAmount("");
        fetchPost();
        fetchBalance();
      }
    } catch {
      setError("Failed to stake");
    } finally {
      setStaking(false);
    }
  };

  const handleTrigger = async () => {
    if (!authData) return;
    setTriggering(true);
    setError("");
    try {
      const res = await authFetch(`/api/forum/${id}/trigger`, authData, { method: "POST" });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || "Failed to trigger");
      } else {
        fetchPost();
      }
    } catch {
      setError("Failed to trigger");
    } finally {
      setTriggering(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  if (!data?.post) {
    return (
      <div className="flex flex-col items-center py-24">
        <p className="text-base-content/60">Post not found.</p>
        <Link href="/forum" className="btn btn-ghost btn-sm mt-4">
          ← Back to Forum
        </Link>
      </div>
    );
  }

  const { post, replies, stakes, larvaResponseCount, larvaPendingCount, larvaResponses } = data;

  return (
    <div className="flex flex-col items-center min-h-screen pt-10 px-4">
      <div className="w-full max-w-3xl">
        <Link href="/forum" className="btn btn-ghost btn-sm mb-4">
          ← Back to Forum
        </Link>

        {/* Post Header */}
        <div className="card rounded-none bg-base-200 shadow-md mb-6">
          <div className="card-body">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="badge badge-accent font-bold">{post.total_cv.toLocaleString()} CV total</span>
              <span className="text-xs text-base-content/50">{timeAgo(post.created_at)}</span>
              <span className="text-xs text-base-content/50 inline-flex items-center gap-1">
                by <Address address={post.wallet} size="xs" />
              </span>
            </div>
            <h1 className="text-2xl font-bold">{post.title}</h1>
            <p className="mt-3 whitespace-pre-wrap">{post.body}</p>
            <p className="text-xs text-base-content/50 mt-2">Initial burn: {post.cv_burned.toLocaleString()} CV</p>
          </div>
        </div>

        {/* Stake CV Form */}
        <div className="card rounded-none bg-base-200 shadow-md mb-6">
          <div className="card-body">
            <h3 className="font-bold">🔥 Stake CV on this post</h3>
            {!address ? (
              <div className="mt-2">
                <RainbowKitCustomConnectButton />
              </div>
            ) : !isAuthenticated ? (
              <button className="btn btn-outline btn-sm mt-2" onClick={signIn} disabled={signing}>
                {signing ? "Signing..." : "Sign in to stake"}
              </button>
            ) : (
              <div className="mt-2">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    className="input input-bordered rounded-none w-48"
                    placeholder="CV amount"
                    min={FORUM_STAKE_MIN}
                    step={100000}
                    value={stakeAmount}
                    onChange={e => setStakeAmount(e.target.value)}
                  />
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleStake}
                    disabled={staking || !stakeAmount || parseInt(stakeAmount) < FORUM_STAKE_MIN}
                  >
                    {staking ? <span className="loading loading-spinner loading-xs"></span> : "Stake"}
                  </button>
                </div>
                <div className="text-xs text-base-content/50 mt-1">
                  Min: {FORUM_STAKE_MIN.toLocaleString()} CV
                  {balance !== null && <span> · Balance: {Math.floor(balance).toLocaleString()} CV</span>}
                </div>
              </div>
            )}
            {error && <p className="text-error text-sm mt-2">{error}</p>}
          </div>
        </div>

        {/* Stakes List */}
        <div className="mb-6">
          <h2 className="text-lg font-bold mb-4">🔥 Stakes ({stakes.length})</h2>
          {stakes.length === 0 ? (
            <p className="text-sm text-base-content/60">No stakes yet. Be the first to back this post!</p>
          ) : (
            <div className="space-y-3">
              {stakes.map((s, i) => (
                <div key={i} className="card rounded-none bg-base-200">
                  <div className="card-body py-3 px-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm">
                        <Address address={s.wallet} size="xs" />
                        <span className="text-xs text-base-content/50">· {timeAgo(s.created_at)}</span>
                      </div>
                      <span className="badge badge-accent badge-sm font-bold">{s.cv_amount.toLocaleString()} CV</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Replies */}
        <div className="mb-6">
          <h2 className="text-lg font-bold mb-4">💬 Replies ({replies.length})</h2>
          {replies.length === 0 ? (
            <p className="text-sm text-base-content/60">No replies yet.</p>
          ) : (
            <div className="space-y-3">
              {replies.map(r => (
                <div key={r.id} className="card rounded-none bg-base-200">
                  <div className="card-body py-3 px-4">
                    <div className="flex items-center gap-2 text-xs text-base-content/50 mb-1">
                      <span className="inline-flex items-center">
                        <Address address={r.wallet} size="xs" />
                      </span>
                      <span>·</span>
                      <span>{r.cv_burned.toLocaleString()} CV</span>
                      <span>·</span>
                      <span>{timeAgo(r.created_at)}</span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{r.body}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Reply Form */}
        <div className="card rounded-none bg-base-200 shadow-md mb-10">
          <div className="card-body">
            <h3 className="font-bold">Reply</h3>
            {!address ? (
              <div className="mt-2">
                <RainbowKitCustomConnectButton />
              </div>
            ) : !isAuthenticated ? (
              <button className="btn btn-outline btn-sm mt-2" onClick={signIn} disabled={signing}>
                {signing ? "Signing..." : "Sign in to reply"}
              </button>
            ) : (
              <div className="mt-2">
                <textarea
                  className="textarea textarea-bordered w-full rounded-none"
                  placeholder="Share your thoughts..."
                  maxLength={2000}
                  rows={3}
                  value={replyBody}
                  onChange={e => setReplyBody(e.target.value)}
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-base-content/50">Costs 200k CV</span>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleReply}
                    disabled={submitting || !replyBody.trim()}
                  >
                    {submitting ? <span className="loading loading-spinner loading-xs"></span> : "Reply"}
                  </button>
                </div>
              </div>
            )}
            {error && <p className="text-error text-sm mt-2">{error}</p>}
          </div>
        </div>

        {/* Larva Hive-Mind Section */}
        {post.larva_triggered && (
          <div className="card rounded-none bg-base-200 shadow-md mb-6">
            <div className="card-body">
              <h2 className="text-lg font-bold">🧠 Larva Hive-Mind</h2>
              {post.aggregated_opinion ? (
                <div className="mt-2">
                  {post.aggregated_opinion_short && (
                    <p className="text-lg font-semibold text-base-content mb-3 leading-snug border-l-2 border-info pl-3">
                      {post.aggregated_opinion_short}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap text-sm">{post.aggregated_opinion}</p>
                </div>
              ) : (
                <div className="mt-2">
                  <p className="text-sm text-base-content/60">
                    Larvae are processing... ({larvaResponseCount} responded, {larvaPendingCount} pending)
                  </p>
                  <span className="loading loading-dots loading-sm mt-2"></span>
                </div>
              )}

              {larvaResponses.length > 0 && (
                <div className="mt-4 pt-4 border-t border-base-300">
                  <h3 className="text-md font-bold mb-3">{"🐛 Larva Perspectives (" + larvaResponses.length + ")"}</h3>
                  <div className="space-y-2">
                    {larvaResponses.map((lr, i) => (
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
                        </div>
                      </div>
                    ))}
                  </div>
                  {larvaPendingCount > 0 && (
                    <p className="text-sm text-base-content/50 mt-2">{larvaPendingCount + " more processing..."}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Trigger Button (OP only, not yet triggered) */}
        {isOP && !post.larva_triggered && (
          <div className="card rounded-none bg-base-200 shadow-md mb-6">
            <div className="card-body">
              <h2 className="text-lg font-bold">🧠 Larva Hive-Mind</h2>
              <p className="text-sm text-base-content/60 mt-1">
                Get an aggregated opinion from all larvae on your post.
              </p>
              {isAuthenticated ? (
                <button className="btn btn-info btn-sm mt-2 w-fit" onClick={handleTrigger} disabled={triggering}>
                  {triggering ? (
                    <span className="loading loading-spinner loading-xs"></span>
                  ) : (
                    "Trigger Larva Response (1M CV)"
                  )}
                </button>
              ) : (
                <button className="btn btn-outline btn-sm mt-2 w-fit" onClick={signIn} disabled={signing}>
                  {signing ? "Signing..." : "Sign in to trigger"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
