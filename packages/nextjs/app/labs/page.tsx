"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { Address } from "~~/components/scaffold-eth";

interface LabsIdea {
  id: number;
  wallet: string;
  title: string;
  total_cv: number;
  cv_burned: number;
  status: string;
  created_at: string;
  stake_count: number;
}

const statusBadge = (status: string) => {
  switch (status) {
    case "pending":
      return <span className="badge badge-sm badge-warning">🟡 Pending</span>;
    case "building":
      return <span className="badge badge-sm badge-info">🔨 Building</span>;
    case "shipped":
      return <span className="badge badge-sm badge-success">✅ Shipped</span>;
    case "rejected":
      return <span className="badge badge-sm badge-error">❌ Rejected</span>;
    default:
      return <span className="badge badge-sm">{status}</span>;
  }
};

const LabsPage: NextPage = () => {
  const { address } = useAccount();
  const [ideas, setIdeas] = useState<LabsIdea[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/labs")
      .then(r => r.json())
      .then(data => {
        setIdeas(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return `${Math.floor(diff / 60000)}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="flex flex-col items-center min-h-screen pt-10 px-4">
      <div className="w-full max-w-3xl">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">🧪 Labs</h1>
          {address && (
            <Link href="/labs/submit" className="btn btn-primary btn-sm">
              + Submit Idea (1M CV)
            </Link>
          )}
        </div>

        <p className="text-base-content/60 text-sm mb-6">
          Burn CV to signal conviction on ideas. Highest conviction rises to the top.
        </p>

        {loading ? (
          <div className="flex justify-center py-12">
            <span className="loading loading-spinner loading-lg"></span>
          </div>
        ) : ideas.length === 0 ? (
          <p className="text-center text-base-content/60 py-12">No ideas yet. Be the first!</p>
        ) : (
          <div className="space-y-4">
            {ideas.map(idea => (
              <div key={idea.id} className="card rounded-none bg-base-200 shadow-md">
                <div className="card-body py-4 px-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="badge badge-sm badge-accent font-bold">
                          {idea.total_cv.toLocaleString()} CV
                        </span>
                        {statusBadge(idea.status)}
                        <span className="text-xs text-base-content/50">{timeAgo(idea.created_at)}</span>
                      </div>
                      <h2 className="text-lg font-semibold">{idea.title}</h2>
                      <p className="text-sm text-base-content/60 mt-1 flex items-center gap-1">
                        <Address address={idea.wallet} size="xs" /> · {idea.stake_count} stake
                        {idea.stake_count !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <Link href={`/labs/${idea.id}`} className="btn btn-ghost btn-sm">
                      View →
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LabsPage;
