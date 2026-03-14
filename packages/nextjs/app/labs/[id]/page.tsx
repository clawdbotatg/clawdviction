"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { Address, RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useAuth } from "~~/hooks/useAuth";
import { authFetch } from "~~/lib/authFetch";

const ADMIN_WALLET = "0x11ce532845ce0eacda41f72fdc1c88c335981442";
const LABS_STAKE_MIN = 100_000;

interface IdeaData {
  idea: {
    id: number;
    wallet: string;
    title: string;
    description: string;
    cv_burned: number;
    total_cv: number;
    status: string;
    created_at: string;
  };
  stakes: {
    wallet: string;
    cv_amount: number;
    created_at: string;
  }[];
}

const statusBadge = (status: string) => {
  switch (status) {
    case "pending":
      return <span className="badge badge-warning">🟡 Pending</span>;
    case "building":
      return <span className="badge badge-info">🔨 Building</span>;
    case "shipped":
      return <span className="badge badge-success">✅ Shipped</span>;
    case "rejected":
      return <span className="badge badge-error">❌ Rejected</span>;
    default:
      return <span className="badge">{status}</span>;
  }
};

const timeAgo = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return `${Math.floor(diff / 60000)}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

export default function LabsIdeaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { address } = useAccount();
  const { isAuthenticated, authData, signIn, signing } = useAuth(address);
  const isAdmin = address?.toLowerCase() === ADMIN_WALLET;

  const [data, setData] = useState<IdeaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [stakeAmount, setStakeAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [adminStatus, setAdminStatus] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const fetchIdea = () => {
    fetch(`/api/labs/${id}`)
      .then(r => r.json())
      .then(d => {
        setData(d);
        if (d.idea) setAdminStatus(d.idea.status);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchIdea();
  }, [id]);

  useEffect(() => {
    if (!address) return;
    fetch(`/api/clawdviction/${address.toLowerCase()}`)
      .then(r => r.json())
      .then(d => {
        if (d.balance !== undefined) setBalance(parseFloat(d.balance));
      })
      .catch(() => {});
  }, [address]);

  const handleStake = async () => {
    if (!authData) return;
    const amount = parseInt(stakeAmount);
    if (isNaN(amount) || amount < LABS_STAKE_MIN) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await authFetch(`/api/labs/${id}/stake`, authData, {
        method: "POST",
        body: JSON.stringify({ cv_amount: amount }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || "Failed to stake");
      } else {
        setStakeAmount("");
        fetchIdea();
        // Refresh balance
        if (address) {
          fetch(`/api/clawdviction/${address.toLowerCase()}`)
            .then(r => r.json())
            .then(d => {
              if (d.balance !== undefined) setBalance(parseFloat(d.balance));
            })
            .catch(() => {});
        }
      }
    } catch {
      setError("Failed to stake");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async () => {
    if (!authData || !adminStatus) return;
    setUpdatingStatus(true);
    setError("");
    try {
      const res = await authFetch(`/api/labs/${id}`, authData, {
        method: "PATCH",
        body: JSON.stringify({ status: adminStatus }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || "Failed to update status");
      } else {
        fetchIdea();
      }
    } catch {
      setError("Failed to update status");
    } finally {
      setUpdatingStatus(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  if (!data?.idea) {
    return (
      <div className="flex flex-col items-center py-24">
        <p className="text-base-content/60">Idea not found.</p>
        <Link href="/labs" className="btn btn-ghost btn-sm mt-4">
          ← Back to Labs
        </Link>
      </div>
    );
  }

  const { idea, stakes } = data;

  return (
    <div className="flex flex-col items-center min-h-screen pt-10 px-4">
      <div className="w-full max-w-3xl">
        <Link href="/labs" className="btn btn-ghost btn-sm mb-4">
          ← Back to Labs
        </Link>

        {/* Idea Header */}
        <div className="card rounded-none bg-base-200 shadow-md mb-6">
          <div className="card-body">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="badge badge-accent font-bold">{idea.total_cv.toLocaleString()} CV total</span>
              {statusBadge(idea.status)}
              <span className="text-xs text-base-content/50">{timeAgo(idea.created_at)}</span>
              <span className="text-xs text-base-content/50 inline-flex items-center gap-1">
                by <Address address={idea.wallet} size="xs" />
              </span>
            </div>
            <h1 className="text-2xl font-bold">{idea.title}</h1>
            <p className="mt-3 whitespace-pre-wrap">{idea.description}</p>
            <p className="text-xs text-base-content/50 mt-2">Initial burn: {idea.cv_burned.toLocaleString()} CV</p>
          </div>
        </div>

        {/* Stake CV Form */}
        <div className="card rounded-none bg-base-200 shadow-md mb-6">
          <div className="card-body">
            <h3 className="font-bold">🔥 Stake CV on this idea</h3>
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
                    min={LABS_STAKE_MIN}
                    step={100000}
                    value={stakeAmount}
                    onChange={e => setStakeAmount(e.target.value)}
                  />
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleStake}
                    disabled={submitting || !stakeAmount || parseInt(stakeAmount) < LABS_STAKE_MIN}
                  >
                    {submitting ? <span className="loading loading-spinner loading-xs"></span> : "Stake"}
                  </button>
                </div>
                <div className="text-xs text-base-content/50 mt-1">
                  Min: {LABS_STAKE_MIN.toLocaleString()} CV
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
            <p className="text-sm text-base-content/60">No stakes yet. Be the first to back this idea!</p>
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

        {/* Admin Section */}
        {isAdmin && isAuthenticated && (
          <div className="card rounded-none bg-base-200 shadow-md mb-10">
            <div className="card-body">
              <h3 className="font-bold">⚙️ Admin: Update Status</h3>
              <div className="flex items-center gap-2 mt-2">
                <select
                  className="select select-bordered select-sm rounded-none"
                  value={adminStatus}
                  onChange={e => setAdminStatus(e.target.value)}
                >
                  <option value="pending">🟡 Pending</option>
                  <option value="building">🔨 Building</option>
                  <option value="shipped">✅ Shipped</option>
                  <option value="rejected">❌ Rejected</option>
                </select>
                <button
                  className="btn btn-sm btn-outline"
                  onClick={handleStatusChange}
                  disabled={updatingStatus || adminStatus === idea.status}
                >
                  {updatingStatus ? <span className="loading loading-spinner loading-xs"></span> : "Update"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
