"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useAuth } from "~~/hooks/useAuth";
import { authFetch } from "~~/lib/authFetch";

export default function LabsSubmitPage() {
  const router = useRouter();
  const { address } = useAccount();
  const { isAuthenticated, authData, signIn, signing } = useAuth(address);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
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
        if (typeof d.labs === "number") setPostCost(d.labs);
      })
      .catch(() => {});
  }, []);

  const canPost = balance !== null && postCost !== null && balance >= postCost;

  const handleSubmit = async () => {
    if (!authData || !title.trim() || !description.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await authFetch("/api/labs", authData, {
        method: "POST",
        body: JSON.stringify({ title, description }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || "Failed to submit idea");
      } else {
        router.push(`/labs/${result.id}`);
      }
    } catch {
      setError("Failed to submit idea");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col items-center min-h-screen pt-10 px-4">
      <div className="w-full max-w-3xl">
        <Link href="/labs" className="btn btn-ghost btn-sm mb-4">
          ← Back to Labs
        </Link>

        <h1 className="text-3xl font-bold mb-6">🧪 Submit Idea</h1>

        {!address ? (
          <div className="card rounded-none bg-base-200 shadow-md">
            <div className="card-body">
              <p className="text-base-content/60 mb-3">Connect your wallet to submit an idea.</p>
              <RainbowKitCustomConnectButton />
            </div>
          </div>
        ) : !isAuthenticated ? (
          <div className="card rounded-none bg-base-200 shadow-md">
            <div className="card-body">
              <p className="text-base-content/60 mb-3">Sign in to submit an idea.</p>
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
                  placeholder="Your idea in a sentence"
                  maxLength={200}
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
                <span className="text-xs text-base-content/50 mt-1">{title.length}/200</span>
              </div>

              <div className="mb-4">
                <label className="label">
                  <span className="label-text">Description</span>
                </label>
                <textarea
                  className="textarea textarea-bordered w-full rounded-none"
                  placeholder="Describe the idea in detail. Why should it be built?"
                  maxLength={2000}
                  rows={6}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
                <span className="text-xs text-base-content/50 mt-1">{description.length}/2000</span>
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
                  disabled={submitting || !title.trim() || !description.trim() || !canPost}
                >
                  {submitting ? <span className="loading loading-spinner loading-xs"></span> : "Submit Idea"}
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
