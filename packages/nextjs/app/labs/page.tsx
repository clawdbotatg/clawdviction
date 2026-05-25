"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { LabsJobBoard } from "~~/components/LabsJobBoard";
import { Address } from "~~/components/scaffold-eth";
import { useAuth } from "~~/hooks/useAuth";
import { authFetch } from "~~/lib/authFetch";

const ADMIN_WALLET = "0x11ce532845ce0eacda41f72fdc1c88c335981442";

interface LabsIdea {
  id: number;
  wallet: string;
  title: string;
  total_cv: number;
  cv_burned: number;
  status: string;
  created_at: string;
  stake_count: number;
  score: number;
  archived: boolean;
  archived_by: string | null;
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
  const { isAuthenticated, authData, signIn, signing } = useAuth(address);
  const isAdmin = address?.toLowerCase() === ADMIN_WALLET;

  const [ideas, setIdeas] = useState<LabsIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [archivingId, setArchivingId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/labs")
      .then(r => r.json())
      .then(data => {
        setIdeas(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const visibleIdeas = useMemo(() => (showArchived ? ideas : ideas.filter(i => !i.archived)), [ideas, showArchived]);

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return `${Math.floor(diff / 60000)}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const handleArchive = async (id: number, archived: boolean) => {
    if (!authData) return;
    setArchivingId(id);
    try {
      const res = await authFetch(`/api/labs/${id}/archive`, authData, {
        method: "POST",
        body: JSON.stringify({ archived }),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setIdeas(prev =>
          prev.map(i =>
            i.id === id
              ? {
                  ...i,
                  archived: result.archived,
                  archived_by: result.archived ? authData.address.toLowerCase() : null,
                }
              : i,
          ),
        );
      }
    } finally {
      setArchivingId(null);
    }
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

        <LabsJobBoard />

        <p className="text-base-content/60 text-sm mb-4">
          Burn CV to signal conviction on ideas. Highest conviction rises to the top.
        </p>

        <div className="flex items-center gap-3 mb-6">
          <label className="cursor-pointer label gap-2 py-0">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={showArchived}
              onChange={e => setShowArchived(e.target.checked)}
            />
            <span className="label-text text-sm">Show archived</span>
          </label>
          {isAdmin && !isAuthenticated && (
            <button className="btn btn-outline btn-xs" onClick={signIn} disabled={signing}>
              {signing ? "Signing..." : "Sign in (admin)"}
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <span className="loading loading-spinner loading-lg"></span>
          </div>
        ) : visibleIdeas.length === 0 ? (
          <p className="text-center text-base-content/60 py-12">
            {ideas.length === 0 ? "No ideas yet. Be the first!" : "No ideas to show."}
          </p>
        ) : (
          <div className="space-y-4">
            {visibleIdeas.map(idea => (
              <div
                key={idea.id}
                className={`card rounded-none bg-base-200 shadow-md ${idea.archived ? "opacity-50" : ""}`}
              >
                <div className="card-body py-4 px-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="badge badge-sm badge-accent font-bold">
                          {idea.total_cv.toLocaleString()} CV
                        </span>
                        {statusBadge(idea.status)}
                        {idea.archived && <span className="badge badge-sm badge-ghost">📦 Archived</span>}
                        <span className="text-xs text-base-content/50">{timeAgo(idea.created_at)}</span>
                        <span
                          className="text-xs font-mono text-base-content/40"
                          title="Sort score: total_cv / (age_hours + 2)^0.7"
                        >
                          score {Math.round(Number(idea.score)).toLocaleString()}
                        </span>
                      </div>
                      <h2 className="text-lg font-semibold">{idea.title}</h2>
                      <p className="text-sm text-base-content/60 mt-1 flex items-center gap-1">
                        <Address address={idea.wallet} size="xs" /> · {idea.stake_count} stake
                        {idea.stake_count !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Link href={`/labs/${idea.id}`} className="btn btn-ghost btn-sm">
                        View →
                      </Link>
                      {isAdmin && isAuthenticated && (
                        <button
                          className="btn btn-outline btn-xs"
                          onClick={() => handleArchive(idea.id, !idea.archived)}
                          disabled={archivingId === idea.id}
                        >
                          {archivingId === idea.id ? (
                            <span className="loading loading-spinner loading-xs"></span>
                          ) : idea.archived ? (
                            "Unarchive"
                          ) : (
                            "Archive"
                          )}
                        </button>
                      )}
                    </div>
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
