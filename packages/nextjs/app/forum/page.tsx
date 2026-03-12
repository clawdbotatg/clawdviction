"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { Address } from "~~/components/scaffold-eth";

interface ForumPost {
  id: number;
  wallet: string;
  title: string;
  cv_burned: number;
  larva_triggered: boolean;
  aggregated_opinion_short: string | null;
  created_at: string;
  reply_count: number;
}

const ForumPage: NextPage = () => {
  const { address } = useAccount();
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/forum")
      .then(r => r.json())
      .then(data => {
        setPosts(Array.isArray(data) ? data : []);
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
          <h1 className="text-3xl font-bold">🐛 Forum</h1>
          {address && (
            <Link href="/forum/submit" className="btn btn-primary btn-sm">
              + New Post
            </Link>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <span className="loading loading-spinner loading-lg"></span>
          </div>
        ) : posts.length === 0 ? (
          <p className="text-center text-base-content/60 py-12">No posts yet. Be the first!</p>
        ) : (
          <div className="space-y-4">
            {posts.map(p => (
              <div key={p.id} className="card rounded-none bg-base-200 shadow-md">
                <div className="card-body py-4 px-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="badge badge-sm badge-accent">{p.cv_burned.toLocaleString()} CV</span>
                        {p.larva_triggered && <span className="badge badge-sm badge-info">🧠 Hive-Mind</span>}
                        <span className="text-xs text-base-content/50">{timeAgo(p.created_at)}</span>
                      </div>
                      <h2 className="text-lg font-semibold">{p.title}</h2>
                      <p className="text-sm text-base-content/60 mt-1 flex items-center gap-1">
                        <Address address={p.wallet} size="xs" /> · {p.reply_count} repl
                        {p.reply_count !== 1 ? "ies" : "y"}
                      </p>
                      {p.aggregated_opinion_short && (
                        <p className="text-xs text-info mt-1 italic">🧠 {p.aggregated_opinion_short}</p>
                      )}
                    </div>
                    <Link href={`/forum/${p.id}`} className="btn btn-ghost btn-sm">
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

export default ForumPage;
