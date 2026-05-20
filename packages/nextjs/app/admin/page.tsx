"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { Address, RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useAuth } from "~~/hooks/useAuth";
import { authFetch } from "~~/lib/authFetch";

const ADMIN_WALLET = "0x11ce532845ce0eacda41f72fdc1c88c335981442";

interface Staker {
  wallet: string;
  stakedM: string;
  liveCV: string;
  onboarded: boolean;
  userMsgs: number;
  botMsgs: number;
  errors: number;
  chatStatus: string;
  lastChat: string | null;
}

const AdminPage: NextPage = () => {
  const { address } = useAccount();
  const { isAuthenticated, authData, signIn, signing } = useAuth(address);
  const [stakers, setStakers] = useState<Staker[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isAdmin = address?.toLowerCase() === ADMIN_WALLET;

  const fetchStats = useCallback(async () => {
    if (!authData) return;
    setLoading(true);
    setError("");
    try {
      const res = await authFetch("/api/admin/stats", authData);
      if (res.status === 403) {
        setError("🚫 Admin only");
        return;
      }
      if (!res.ok) {
        setError("Failed to fetch stats");
        return;
      }
      const data = await res.json();
      setStakers(data.stakers);
    } catch {
      setError("Failed to fetch stats");
    } finally {
      setLoading(false);
    }
  }, [authData]);

  useEffect(() => {
    if (isAuthenticated && isAdmin) {
      fetchStats();
    }
  }, [isAuthenticated, isAdmin, fetchStats]);

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
          <h2 className="text-2xl font-bold mb-2">Admin Dashboard</h2>
          <p className="text-base-content/60 mb-5">Sign to verify your wallet.</p>
          <button className="btn btn-primary btn-lg" onClick={signIn} disabled={signing}>
            {signing ? (
              <>
                <span className="loading loading-spinner loading-sm" />
                Waiting for signature...
              </>
            ) : (
              "Sign Message 🔐"
            )}
          </button>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center flex-col flex-grow pt-20">
        <div className="text-6xl mb-4">🚫</div>
        <p className="text-xl font-bold">Admin only</p>
        <p className="text-base-content/60 mt-2">Your wallet is not authorized to view this page.</p>
      </div>
    );
  }

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="flex flex-col flex-grow px-4 py-6 max-w-7xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-error">🦀 Admin Dashboard</h1>
        <div className="flex gap-2">
          <Link href="/admin/errors" className="btn btn-sm btn-outline">
            🚨 Errors
          </Link>
          <button className="btn btn-sm btn-outline" onClick={fetchStats} disabled={loading}>
            {loading ? <span className="loading loading-spinner loading-sm" /> : "🔄 Refresh"}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error mb-4">{error}</div>}

      <div className="overflow-x-auto bg-base-200 rounded-lg">
        <table className="table table-sm w-full">
          <thead>
            <tr className="text-error">
              <th>Wallet</th>
              <th className="text-right">Staked (M)</th>
              <th className="text-right">Live CV</th>
              <th className="text-center">Onboarded</th>
              <th className="text-right">User Msgs</th>
              <th className="text-right">Bot Msgs</th>
              <th className="text-right">Errors</th>
              <th>Chat Status</th>
              <th>Last Chat</th>
            </tr>
          </thead>
          <tbody>
            {stakers.map(s => (
              <tr key={s.wallet} className="hover">
                <td>
                  <Address address={s.wallet} format="short" size="sm" />
                </td>
                <td className="text-right tabular-nums">{s.stakedM}</td>
                <td className="text-right tabular-nums">
                  {Number(s.liveCV).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </td>
                <td className="text-center">{s.onboarded ? "✅" : "❌"}</td>
                <td className="text-right tabular-nums">{s.userMsgs}</td>
                <td className="text-right tabular-nums">{s.botMsgs}</td>
                <td className="text-right tabular-nums">{s.errors}</td>
                <td>{s.chatStatus}</td>
                <td className="text-xs">{formatDate(s.lastChat)}</td>
              </tr>
            ))}
            {stakers.length === 0 && !loading && (
              <tr>
                <td colSpan={9} className="text-center text-base-content/40 py-8">
                  No stakers found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-base-content/40 mt-4">{stakers.length} stakers total</p>
    </div>
  );
};

export default AdminPage;
