"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { Address, RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useAuth } from "~~/hooks/useAuth";
import { authFetch } from "~~/lib/authFetch";

const ADMIN_WALLET = "0x11ce532845ce0eacda41f72fdc1c88c335981442";

const SURFACES = [
  "chat",
  "greet",
  "forum-queue",
  "labs-queue",
  "gov-queue",
  "forum-agg",
  "labs-agg",
  "gov-agg",
  "memory-compress",
] as const;

const HOURS_PRESETS = [
  { label: "1h", value: 1 },
  { label: "6h", value: 6 },
  { label: "24h", value: 24 },
  { label: "7d", value: 168 },
  { label: "30d", value: 720 },
];

interface LarvaError {
  id: number;
  surface: string;
  error_type: string;
  wallet: string | null;
  status_code: number | null;
  message: string | null;
  context: Record<string, unknown> | null;
  created_at: string;
}

interface CountRow {
  surface: string;
  error_type: string;
  count: number;
}

interface WalletCount {
  wallet: string;
  count: number;
}

const surfaceColor = (s: string) => {
  if (s === "chat" || s === "greet") return "badge-primary";
  if (s.endsWith("-queue")) return "badge-warning";
  if (s.endsWith("-agg")) return "badge-info";
  return "badge-ghost";
};

const typeColor = (t: string) => {
  if (t === "auth" || t === "forbidden") return "badge-error";
  if (t === "rate_limit") return "badge-warning";
  if (t === "insufficient_cv") return "badge-info";
  if (t === "model_error" || t === "internal") return "badge-error";
  if (t === "model_empty") return "badge-warning";
  if (t === "bad_request") return "badge-ghost";
  return "badge-neutral";
};

const fmtRelative = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
};

const ErrorsPage: NextPage = () => {
  const { address } = useAccount();
  const { isAuthenticated, authData, signIn, signing } = useAuth(address);
  const isAdmin = address?.toLowerCase() === ADMIN_WALLET;

  const [errors, setErrors] = useState<LarvaError[]>([]);
  const [counts, setCounts] = useState<CountRow[]>([]);
  const [topWallets, setTopWallets] = useState<WalletCount[]>([]);
  const [hours, setHours] = useState(24);
  const [surfaceFilter, setSurfaceFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [walletFilter, setWalletFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  const fetchErrors = useCallback(async () => {
    if (!authData) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("hours", String(hours));
      if (surfaceFilter) params.set("surface", surfaceFilter);
      if (typeFilter) params.set("type", typeFilter);
      if (walletFilter.trim()) params.set("wallet", walletFilter.trim());
      const res = await authFetch(`/api/admin/errors?${params.toString()}`, authData);
      if (res.status === 403) {
        setError("🚫 Admin only");
        return;
      }
      if (!res.ok) {
        setError(`Failed to fetch: ${res.status}`);
        return;
      }
      const data = await res.json();
      setErrors(data.errors);
      setCounts(data.counts);
      setTopWallets(data.topWallets);
    } catch (e) {
      setError(`Failed to fetch: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setLoading(false);
    }
  }, [authData, hours, surfaceFilter, typeFilter, walletFilter]);

  useEffect(() => {
    if (isAuthenticated && isAdmin) {
      fetchErrors();
    }
  }, [isAuthenticated, isAdmin, fetchErrors]);

  if (!address) {
    return (
      <div className="flex items-center flex-col flex-grow pt-20">
        <div className="text-6xl mb-4">🔐</div>
        <RainbowKitCustomConnectButton />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center flex-col flex-grow pt-20 px-5">
        <div className="text-6xl mb-4">🔐</div>
        <div className="bg-base-100/60 backdrop-blur-sm rounded-none px-6 py-5 text-center max-w-md">
          <h2 className="text-2xl font-bold mb-2">Larva Errors</h2>
          <p className="text-base-content/60 mb-5">Sign to verify your wallet.</p>
          <button className="btn btn-primary btn-lg" onClick={signIn} disabled={signing}>
            {signing ? "Waiting for signature..." : "Sign Message 🦀"}
          </button>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center flex-col flex-grow pt-20">
        <div className="text-6xl mb-4">🚫</div>
        <p>Admin only. You are signed in as:</p>
        <Address address={address} />
      </div>
    );
  }

  const totalErrors = counts.reduce((sum, c) => sum + c.count, 0);

  return (
    <div className="flex flex-col flex-grow pt-6 px-5 max-w-7xl mx-auto w-full pb-12">
      <div className="flex items-baseline justify-between mb-4">
        <h1 className="text-3xl font-bold">🚨 Larva Errors</h1>
        <Link href="/admin" className="link link-hover text-sm">
          ← admin home
        </Link>
      </div>

      {/* Filter bar */}
      <div className="bg-base-100/60 backdrop-blur-sm rounded-none p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-base-content/60 block mb-1">Window</label>
          <div className="join">
            {HOURS_PRESETS.map(p => (
              <button
                key={p.value}
                className={`btn btn-sm join-item ${hours === p.value ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setHours(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-base-content/60 block mb-1">Surface</label>
          <select
            className="select select-bordered select-sm rounded-none"
            value={surfaceFilter}
            onChange={e => setSurfaceFilter(e.target.value)}
          >
            <option value="">all</option>
            {SURFACES.map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-base-content/60 block mb-1">Type</label>
          <input
            type="text"
            placeholder="e.g. model_error"
            className="input input-bordered input-sm rounded-none w-44"
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-base-content/60 block mb-1">Wallet</label>
          <input
            type="text"
            placeholder="0x..."
            className="input input-bordered input-sm rounded-none w-72 font-mono"
            value={walletFilter}
            onChange={e => setWalletFilter(e.target.value)}
          />
        </div>
        <button className="btn btn-sm btn-primary" onClick={fetchErrors} disabled={loading}>
          {loading ? <span className="loading loading-spinner loading-xs" /> : "Refresh"}
        </button>
      </div>

      {error && <div className="alert alert-error rounded-none mb-4">{error}</div>}

      {/* Summary panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-base-100/60 backdrop-blur-sm rounded-none p-4">
          <div className="text-sm font-bold mb-2">By surface × type ({totalErrors} total)</div>
          {counts.length === 0 ? (
            <div className="text-base-content/40 text-sm">✅ no errors in this window</div>
          ) : (
            <div className="space-y-1">
              {counts.map((c, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="flex gap-2">
                    <span className={`badge badge-sm ${surfaceColor(c.surface)}`}>{c.surface}</span>
                    <span className={`badge badge-sm ${typeColor(c.error_type)}`}>{c.error_type}</span>
                  </div>
                  <span className="font-mono tabular-nums">{c.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-base-100/60 backdrop-blur-sm rounded-none p-4">
          <div className="text-sm font-bold mb-2">Top failing wallets</div>
          {topWallets.length === 0 ? (
            <div className="text-base-content/40 text-sm">—</div>
          ) : (
            <div className="space-y-1">
              {topWallets.map((w, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <button
                    className="link link-hover font-mono text-xs"
                    onClick={() => setWalletFilter(w.wallet)}
                    title="click to filter"
                  >
                    {w.wallet.slice(0, 10)}…{w.wallet.slice(-6)}
                  </button>
                  <span className="font-mono tabular-nums">{w.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Errors list */}
      <div className="bg-base-100/60 backdrop-blur-sm rounded-none">
        <div className="px-4 py-3 border-b border-base-300 flex items-center justify-between">
          <div className="font-bold">Recent errors ({errors.length})</div>
          <div className="text-xs text-base-content/40">click a row to expand</div>
        </div>
        {errors.length === 0 ? (
          <div className="p-8 text-center text-base-content/40">
            {loading ? <span className="loading loading-spinner" /> : "✅ no errors matching these filters"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Surface</th>
                  <th>Type</th>
                  <th>Wallet</th>
                  <th>Status</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {errors.map(err => {
                  const isOpen = expanded === err.id;
                  return (
                    <>
                      <tr
                        key={err.id}
                        className="cursor-pointer hover:bg-base-200/40"
                        onClick={() => setExpanded(isOpen ? null : err.id)}
                      >
                        <td className="text-xs text-base-content/60 whitespace-nowrap">
                          {fmtRelative(err.created_at)}
                        </td>
                        <td>
                          <span className={`badge badge-sm ${surfaceColor(err.surface)}`}>{err.surface}</span>
                        </td>
                        <td>
                          <span className={`badge badge-sm ${typeColor(err.error_type)}`}>{err.error_type}</span>
                        </td>
                        <td className="font-mono text-xs">
                          {err.wallet ? `${err.wallet.slice(0, 10)}…${err.wallet.slice(-4)}` : "—"}
                        </td>
                        <td className="font-mono text-xs">{err.status_code ?? "—"}</td>
                        <td className="text-xs max-w-md truncate">{err.message ?? "—"}</td>
                      </tr>
                      {isOpen && (
                        <tr key={`${err.id}-detail`} className="bg-base-200/30">
                          <td colSpan={6} className="p-3">
                            <div className="text-xs text-base-content/60 mb-1">
                              {new Date(err.created_at).toISOString()} · id #{err.id}
                            </div>
                            {err.wallet && (
                              <div className="text-xs mb-1">
                                wallet: <span className="font-mono">{err.wallet}</span>
                              </div>
                            )}
                            {err.message && (
                              <pre className="text-xs bg-base-300/40 p-2 rounded-none whitespace-pre-wrap break-all">
                                {err.message}
                              </pre>
                            )}
                            {err.context && (
                              <pre className="text-xs bg-base-300/40 p-2 rounded-none mt-1 whitespace-pre-wrap break-all">
                                {JSON.stringify(err.context, null, 2)}
                              </pre>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ErrorsPage;
