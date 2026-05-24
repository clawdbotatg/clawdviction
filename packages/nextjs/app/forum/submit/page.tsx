"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useAuth } from "~~/hooks/useAuth";
import { authFetch } from "~~/lib/authFetch";

export default function ForumSubmitPage() {
  const router = useRouter();
  const { address } = useAccount();
  const { isAuthenticated, authData, signIn, signing } = useAuth(address);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [postCost, setPostCost] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!address) return;
    fetch(`/api/clawdviction/${address.toLowerCase()}`)
      .then(r => r.json())
      .then(d => {
        if (d.balance !== undefined) setBalance(parseFloat(d.balance));
      })
      .catch(() => {});
  }, [address]);

  useEffect(() => {
    fetch("/api/post-costs")
      .then(r => r.json())
      .then(d => {
        if (typeof d.forum === "number") setPostCost(d.forum);
      })
      .catch(() => {});
  }, []);

  const canPost = balance !== null && postCost !== null && balance >= postCost;

  const handleSubmit = async () => {
    if (!authData || !title.trim() || !body.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await authFetch("/api/forum", authData, {
        method: "POST",
        body: JSON.stringify({ title, body }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || "Failed to create post");
      } else {
        router.push(`/forum/${result.id}`);
      }
    } catch {
      setError("Failed to create post");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col items-center min-h-screen pt-10 px-4">
      <div className="w-full max-w-3xl">
        <Link href="/forum" className="btn btn-ghost btn-sm mb-4">
          ← Back to Forum
        </Link>

        <h1 className="text-3xl font-bold mb-6">📝 New Post</h1>

        {!address ? (
          <div className="card rounded-none bg-base-200 shadow-md">
            <div className="card-body">
              <p className="text-base-content/60 mb-3">Connect your wallet to post.</p>
              <RainbowKitCustomConnectButton />
            </div>
          </div>
        ) : !isAuthenticated ? (
          <div className="card rounded-none bg-base-200 shadow-md">
            <div className="card-body">
              <p className="text-base-content/60 mb-3">Sign in to post.</p>
              <button className="btn btn-outline btn-sm" onClick={signIn} disabled={signing}>
                {signing ? "Signing..." : "Sign In"}
              </button>
            </div>
          </div>
        ) : (
          <div className="card rounded-none bg-base-200 shadow-md">
            <div className="card-body">
              <div className="mb-4">
                <label className="label">
                  <span className="label-text">Title</span>
                </label>
                <input
                  type="text"
                  className="input input-bordered w-full rounded-none"
                  placeholder="Post title"
                  maxLength={200}
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
                <span className="text-xs text-base-content/50 mt-1">{title.length}/200</span>
              </div>

              <div className="mb-4">
                <label className="label">
                  <span className="label-text">Body</span>
                </label>
                <textarea
                  className="textarea textarea-bordered w-full rounded-none"
                  placeholder="What's on your mind?"
                  maxLength={2000}
                  rows={6}
                  value={body}
                  onChange={e => setBody(e.target.value)}
                />
                <span className="text-xs text-base-content/50 mt-1">{body.length}/2000</span>
              </div>

              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-sm">
                  <span className="text-warning font-semibold">
                    {postCost !== null ? `Costs ${postCost.toLocaleString()} CV` : "Loading cost…"}
                  </span>
                  {balance !== null && (
                    <span className="text-base-content/50 ml-2">
                      (Balance: {Math.floor(balance).toLocaleString()} CV)
                    </span>
                  )}
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleSubmit}
                  disabled={submitting || !title.trim() || !body.trim() || !canPost}
                >
                  {submitting ? <span className="loading loading-spinner loading-xs"></span> : "Submit Post"}
                </button>
              </div>

              {!canPost && balance !== null && <p className="text-error text-sm mt-2">Insufficient CV balance.</p>}
              {error && <p className="text-error text-sm mt-2">{error}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
