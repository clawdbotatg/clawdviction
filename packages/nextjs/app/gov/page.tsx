"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { NextPage } from "next";
import { useAccount } from "wagmi";

const ADMIN_WALLET = "0x11ce532845ce0eacda41f72fdc1c88c335981442";

interface Proposal {
  id: number;
  type: string;
  title: string;
  question: string;
  created_by: string;
  created_at: string;
  status: string;
  response_count: number;
  options?: { id: string; label: string }[] | null;
  closes_at?: string | null;
  duration_hours?: number | null;
}

function ClosesAtLabel({ closesAt }: { closesAt: string }) {
  const now = Date.now();
  const end = new Date(closesAt).getTime();
  const diff = end - now;
  if (diff <= 0) {
    return <span className="text-xs text-base-content/50">Closed</span>;
  }
  const hours = Math.floor(diff / 3600000);
  if (hours > 0) {
    return <span className="text-xs text-warning">Closes in {hours}h</span>;
  }
  const mins = Math.floor(diff / 60000);
  return <span className="text-xs text-warning">Closes in {mins}m</span>;
}

const GovPage: NextPage = () => {
  const { address } = useAccount();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = address?.toLowerCase() === ADMIN_WALLET;

  useEffect(() => {
    fetch("/api/gov")
      .then(r => r.json())
      .then(data => {
        setProposals(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col items-center min-h-screen pt-10 px-4">
      <div className="w-full max-w-3xl">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">🦞 Governance</h1>
          {isAdmin && (
            <Link href="/gov/create" className="btn btn-primary btn-sm">
              + Create Proposal
            </Link>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <span className="loading loading-spinner loading-lg"></span>
          </div>
        ) : proposals.length === 0 ? (
          <p className="text-center text-base-content/60 py-12">No proposals yet.</p>
        ) : (
          <div className="space-y-4">
            {proposals.map(p => (
              <div key={p.id} className="card rounded-none bg-base-200 shadow-md">
                <div className="card-body py-4 px-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`badge badge-sm ${p.type === "vote" ? "badge-error" : "badge-info"}`}>
                          {p.type.toUpperCase()}
                        </span>
                        {p.options && Array.isArray(p.options) && p.options.length > 0 && (
                          <span className="badge badge-sm badge-outline">{p.options.length} options</span>
                        )}
                        {p.closes_at && <ClosesAtLabel closesAt={p.closes_at} />}
                        <span className="text-xs text-base-content/50">
                          {new Date(p.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <h2 className="text-lg font-semibold">{p.title}</h2>
                      <p className="text-sm text-base-content/60 mt-1">
                        {p.response_count} response{p.response_count !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <Link href={`/gov/${p.id}`} className="btn btn-ghost btn-sm">
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

export default GovPage;
