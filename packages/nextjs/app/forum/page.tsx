"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { Address } from "~~/components/scaffold-eth";
import { useAuth } from "~~/hooks/useAuth";
import { authFetch } from "~~/lib/authFetch";

const ADMIN_WALLET = "0x11ce532845ce0eacda41f72fdc1c88c335981442";

interface ForumPost {
  id: number;
  wallet: string;
  title: string;
  cv_burned: number;
  total_cv: number;
  larva_triggered: boolean;
  aggregated_opinion_short: string | null;
  created_at: string;
  reply_count: number;
  stake_count: number;
  score: number;
  archived: boolean;
  archived_by: string | null;
}

const ForumPage: NextPage = () => {
  const { address } = useAccount();
  const { isAuthenticated, authData, signIn, signing } = useAuth(address);
  const isAdmin = address?.toLowerCase() === ADMIN_WALLET;

  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [archivingId, setArchivingId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/forum")
      .then(r => r.json())
      .then(data => {
        setPosts(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const visiblePosts = useMemo(() => (showArchived ? posts : posts.filter(p => !p.archived)), [posts, showArchived]);

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
      const res = await authFetch(`/api/forum/${id}/archive`, authData, {
        method: "POST",
        body: JSON.stringify({ archived }),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setPosts(prev =>
          prev.map(p =>
            p.id === id
              ? {
                  ...p,
                  archived: result.archived,
                  archived_by: result.archived ? authData.address.toLowerCase() : null,
                }
              : p,
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
          <h1 className="text-3xl font-bold">🐛 Forum</h1>
          {address && (
            <Link href="/forum/submit" className="btn btn-primary btn-sm">
              + New Post
            </Link>
          )}
        </div>

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
        ) : visiblePosts.length === 0 ? (
          <p className="text-center text-base-content/60 py-12">
            {posts.length === 0 ? "No posts yet. Be the first!" : "No posts to show."}
          </p>
        ) : (
          <div className="space-y-4">
            {visiblePosts.map(p => (
              <div key={p.id} className={`card rounded-none bg-base-200 shadow-md ${p.archived ? "opacity-50" : ""}`}>
                <div className="card-body py-4 px-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="badge badge-sm badge-accent font-bold">{p.total_cv.toLocaleString()} CV</span>
                        {p.larva_triggered && <span className="badge badge-sm badge-info">🧠 Hive-Mind</span>}
                        {p.archived && <span className="badge badge-sm badge-ghost">📦 Archived</span>}
                        <span className="text-xs text-base-content/50">{timeAgo(p.created_at)}</span>
                        <span
                          className="text-xs font-mono text-base-content/40"
                          title="Sort score: total_cv / (age_hours + 2)^0.7"
                        >
                          score {Math.round(Number(p.score)).toLocaleString()}
                        </span>
                      </div>
                      <h2 className="text-lg font-semibold">{p.title}</h2>
                      <p className="text-sm text-base-content/60 mt-1 flex items-center gap-1">
                        <Address address={p.wallet} size="xs" /> · {p.stake_count} stake
                        {p.stake_count !== 1 ? "s" : ""} · {p.reply_count} repl
                        {p.reply_count !== 1 ? "ies" : "y"}
                      </p>
                      {p.aggregated_opinion_short && (
                        <p className="text-base font-medium text-base-content mt-2 leading-snug border-l-2 border-info pl-3">
                          <span className="opacity-70 mr-1">🧠</span>
                          {p.aggregated_opinion_short}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Link href={`/forum/${p.id}`} className="btn btn-ghost btn-sm">
                        View →
                      </Link>
                      {isAdmin && isAuthenticated && (
                        <button
                          className="btn btn-outline btn-xs"
                          onClick={() => handleArchive(p.id, !p.archived)}
                          disabled={archivingId === p.id}
                        >
                          {archivingId === p.id ? (
                            <span className="loading loading-spinner loading-xs"></span>
                          ) : p.archived ? (
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

export default ForumPage;
