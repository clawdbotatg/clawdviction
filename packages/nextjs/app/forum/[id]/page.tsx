"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useAuth } from "~~/hooks/useAuth";
import { authFetch } from "~~/lib/authFetch";

interface PostData {
  post: {
    id: number;
    wallet: string;
    title: string;
    body: string;
    cv_burned: number;
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
  larvaResponseCount: number;
  larvaPendingCount: number;
  larvaResponses: {
    wallet: string;
    response: string;
    created_at: string;
  }[];
}

const truncateWallet = (w: string) => `${w.slice(0, 6)}...${w.slice(-4)}`;

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
  const [error, setError] = useState("");

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

  const { post, replies, larvaResponseCount, larvaPendingCount, larvaResponses } = data;

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
              <span className="badge badge-sm badge-accent">{post.cv_burned.toLocaleString()} CV burned</span>
              <span className="text-xs text-base-content/50">{timeAgo(post.created_at)}</span>
              <span className="text-xs text-base-content/50">by {truncateWallet(post.wallet)}</span>
            </div>
            <h1 className="text-2xl font-bold">{post.title}</h1>
            <p className="mt-3 whitespace-pre-wrap">{post.body}</p>
          </div>
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
                      <span>{truncateWallet(r.wallet)}</span>
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
                    <p className="text-sm font-semibold text-info mb-2">{post.aggregated_opinion_short}</p>
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
