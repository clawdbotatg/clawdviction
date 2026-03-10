"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useAuth } from "~~/hooks/useAuth";
import { authFetch } from "~~/lib/authFetch";

const ADMIN_WALLET = "0x11ce532845ce0eacda41f72fdc1c88c335981442";

interface VoteOption {
  id: string;
  label: string;
  earn_pct: number;
  burn_pct: number;
}

const DEFAULT_OPTIONS: VoteOption[] = [
  { id: "none", label: "None", earn_pct: 0, burn_pct: 0 },
  { id: "1mo", label: "1 month lockup", earn_pct: 0.5, burn_pct: 1 },
  { id: "3mo", label: "3 months lockup", earn_pct: 2, burn_pct: 3 },
  { id: "6mo", label: "6 months lockup", earn_pct: 5, burn_pct: 5 },
];

export default function CreateProposalPage() {
  const { address } = useAccount();
  const { isAuthenticated, authData, signIn, signing } = useAuth(address);
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [type, setType] = useState<"rfc" | "vote">("rfc");
  const [question, setQuestion] = useState("");
  const [durationHours, setDurationHours] = useState(24);
  const [options, setOptions] = useState<VoteOption[]>(DEFAULT_OPTIONS);
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

  const updateOption = (idx: number, field: keyof VoteOption, value: string | number) => {
    setOptions(prev => prev.map((opt, i) => (i === idx ? { ...opt, [field]: value } : opt)));
  };

  const addOption = () => {
    setOptions(prev => [...prev, { id: "", label: "", earn_pct: 0, burn_pct: 0 }]);
  };

  const removeOption = (idx: number) => {
    if (options.length <= 2) return;
    setOptions(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !question.trim()) {
      setError("Title and question are required.");
      return;
    }

    if (type === "vote") {
      // Validate options
      for (const opt of options) {
        if (!opt.id.trim() || !opt.label.trim()) {
          setError("All options need an ID and label.");
          return;
        }
      }
      const ids = options.map(o => o.id.trim());
      if (new Set(ids).size !== ids.length) {
        setError("Option IDs must be unique.");
        return;
      }
    }

    setSubmitting(true);
    setError("");
    try {
      const body: Record<string, unknown> = { title, question, type };
      if (type === "vote") {
        body.options = options.map(o => ({
          id: o.id.trim(),
          label: o.label.trim(),
          earn_pct: Number(o.earn_pct),
          burn_pct: Number(o.burn_pct),
        }));
        body.duration_hours = durationHours;
      }
      const res = await authFetch("/api/gov", authData, {
        method: "POST",
        body: JSON.stringify(body),
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
                <span>Vote (Multi-Option)</span>
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

          {/* Vote-specific: duration + options */}
          {type === "vote" && (
            <>
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Duration (hours)</span>
                </label>
                <input
                  type="number"
                  className="input input-bordered rounded-none w-full"
                  value={durationHours}
                  onChange={e => setDurationHours(parseInt(e.target.value) || 24)}
                  min="1"
                  max="168"
                />
                <label className="label">
                  <span className="label-text-alt text-base-content/50">Vote closes after this many hours</span>
                </label>
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Vote Options</span>
                </label>
                <div className="space-y-3">
                  {options.map((opt, idx) => (
                    <div key={idx} className="bg-base-300 p-3 space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          className="input input-bordered input-sm rounded-none flex-1"
                          placeholder="ID (e.g. 1mo)"
                          value={opt.id}
                          onChange={e => updateOption(idx, "id", e.target.value)}
                        />
                        <input
                          type="text"
                          className="input input-bordered input-sm rounded-none flex-[2]"
                          placeholder="Label (e.g. 1 month lockup)"
                          value={opt.label}
                          onChange={e => updateOption(idx, "label", e.target.value)}
                        />
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm rounded-none text-error"
                          onClick={() => removeOption(idx)}
                          disabled={options.length <= 2}
                        >
                          ✕
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <div className="flex items-center gap-1 flex-1">
                          <span className="text-xs text-success">Earn %</span>
                          <input
                            type="number"
                            step="0.1"
                            className="input input-bordered input-sm rounded-none w-20"
                            value={opt.earn_pct}
                            onChange={e => updateOption(idx, "earn_pct", parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div className="flex items-center gap-1 flex-1">
                          <span className="text-xs text-error">Burn %</span>
                          <input
                            type="number"
                            step="0.1"
                            className="input input-bordered input-sm rounded-none w-20"
                            value={opt.burn_pct}
                            onChange={e => updateOption(idx, "burn_pct", parseFloat(e.target.value) || 0)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <button type="button" className="btn btn-ghost btn-sm rounded-none mt-2" onClick={addOption}>
                  + Add Option
                </button>
              </div>
            </>
          )}

          {error && <p className="text-error text-sm">{error}</p>}

          <button type="submit" className="btn btn-primary w-full rounded-none" disabled={submitting}>
            {submitting ? <span className="loading loading-spinner loading-sm"></span> : "Create Proposal"}
          </button>
        </form>
      </div>
    </div>
  );
}
