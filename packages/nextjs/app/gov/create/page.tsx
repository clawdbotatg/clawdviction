"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useAuth } from "~~/hooks/useAuth";
import { authFetch } from "~~/lib/authFetch";

const ADMIN_WALLET = "0x11ce532845ce0eacda41f72fdc1c88c335981442";

export default function CreateProposalPage() {
  const { address } = useAccount();
  const { isAuthenticated, authData, signIn, signing } = useAuth(address);
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [type, setType] = useState<"rfc" | "vote">("rfc");
  const [question, setQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const isAdmin = address?.toLowerCase() === ADMIN_WALLET;

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center pt-20">
        <p className="text-lg">Admin access required.</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center pt-20 gap-4">
        <p>Please sign in to create proposals.</p>
        <button className="btn btn-primary" onClick={signIn} disabled={signing}>
          {signing ? "Signing..." : "Sign In"}
        </button>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !question.trim()) {
      setError("Title and question are required.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await authFetch("/api/gov", authData, {
        method: "POST",
        body: JSON.stringify({ title, question, type }),
      });
      if (res.ok) {
        router.push("/gov");
      } else {
        const data = await res.json();
        setError(data.error || "Failed to create proposal");
      }
    } catch {
      setError("Network error");
    }
    setSubmitting(false);
  };

  return (
    <div className="flex flex-col items-center min-h-screen pt-10 px-4">
      <div className="w-full max-w-xl">
        <h1 className="text-2xl font-bold mb-6">Create Proposal</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">Title</span>
            </label>
            <input
              type="text"
              className="input input-bordered rounded-none w-full"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Proposal title"
            />
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text">Type</span>
            </label>
            <div className="flex gap-4">
              <label className="label cursor-pointer gap-2">
                <input
                  type="radio"
                  name="type"
                  className="radio radio-primary"
                  checked={type === "rfc"}
                  onChange={() => setType("rfc")}
                />
                <span>RFC (Request for Comment)</span>
              </label>
              <label className="label cursor-pointer gap-2">
                <input
                  type="radio"
                  name="type"
                  className="radio radio-primary"
                  checked={type === "vote"}
                  onChange={() => setType("vote")}
                />
                <span>Vote (Yes/No/Abstain)</span>
              </label>
            </div>
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text">Question</span>
            </label>
            <textarea
              className="textarea textarea-bordered rounded-none w-full h-32"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="What should the larvas respond to?"
            />
          </div>

          {error && <p className="text-error text-sm">{error}</p>}

          <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
            {submitting ? <span className="loading loading-spinner loading-sm"></span> : "Create Proposal"}
          </button>
        </form>
      </div>
    </div>
  );
}
