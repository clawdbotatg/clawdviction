"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useAuth } from "~~/hooks/useAuth";
import { isLabsJobsAdmin } from "~~/lib/admins";
import { authFetch } from "~~/lib/authFetch";

type Phase = "idea" | "build" | "test" | "shipped";

type Job = {
  id: number;
  title: string;
  phase: Phase;
  archived: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

const PHASES: { key: Phase; label: string; emoji: string }[] = [
  { key: "idea", label: "Idea", emoji: "💡" },
  { key: "build", label: "Build", emoji: "🔨" },
  { key: "test", label: "Test", emoji: "🧪" },
  { key: "shipped", label: "Shipped", emoji: "🚀" },
];

export const LabsJobBoard = () => {
  const { address } = useAccount();
  const { isAuthenticated, authData, signIn, signing } = useAuth(address);
  const isAdmin = isLabsJobsAdmin(address);
  const canEdit = isAdmin && isAuthenticated;

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [addingTo, setAddingTo] = useState<Phase | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [dragOverPhase, setDragOverPhase] = useState<Phase | null>(null);

  const load = async () => {
    try {
      const r = await fetch("/api/labs-jobs");
      const data = await r.json();
      setJobs(Array.isArray(data) ? data : []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const visible = showArchived ? jobs : jobs.filter(j => !j.archived);
  const byPhase = (phase: Phase) => visible.filter(j => j.phase === phase);

  const handleAdd = async (phase: Phase) => {
    if (!authData || !newTitle.trim()) return;
    const res = await authFetch("/api/labs-jobs", authData, {
      method: "POST",
      body: JSON.stringify({ title: newTitle.trim(), phase }),
    });
    if (res.ok) {
      const created = await res.json();
      setJobs(prev => [created, ...prev]);
      setNewTitle("");
      setAddingTo(null);
    }
  };

  const handleSaveEdit = async (id: number) => {
    if (!authData || !editTitle.trim()) return;
    const res = await authFetch(`/api/labs-jobs/${id}`, authData, {
      method: "PATCH",
      body: JSON.stringify({ title: editTitle.trim() }),
    });
    if (res.ok) {
      const updated = await res.json();
      setJobs(prev => prev.map(j => (j.id === id ? updated : j)));
      setEditingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!authData) return;
    if (!confirm("Delete this card?")) return;
    const res = await authFetch(`/api/labs-jobs/${id}`, authData, { method: "DELETE" });
    if (res.ok) setJobs(prev => prev.filter(j => j.id !== id));
  };

  const handleArchive = async (id: number, archived: boolean) => {
    if (!authData) return;
    const res = await authFetch(`/api/labs-jobs/${id}`, authData, {
      method: "PATCH",
      body: JSON.stringify({ archived }),
    });
    if (res.ok) {
      const updated = await res.json();
      setJobs(prev => prev.map(j => (j.id === id ? updated : j)));
    }
  };

  const handleDrop = async (phase: Phase, id: number) => {
    setDragOverPhase(null);
    const job = jobs.find(j => j.id === id);
    if (!job || job.phase === phase || !authData) return;
    // Optimistic update
    setJobs(prev => prev.map(j => (j.id === id ? { ...j, phase } : j)));
    const res = await authFetch(`/api/labs-jobs/${id}`, authData, {
      method: "PATCH",
      body: JSON.stringify({ phase }),
    });
    if (!res.ok) {
      // Revert on failure
      setJobs(prev => prev.map(j => (j.id === id ? { ...j, phase: job.phase } : j)));
    } else {
      const updated = await res.json();
      setJobs(prev => prev.map(j => (j.id === id ? updated : j)));
    }
  };

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold">📋 Job Board</h2>
          {isAdmin && !isAuthenticated && (
            <button className="btn btn-outline btn-xs" onClick={signIn} disabled={signing}>
              {signing ? "Signing..." : "Sign in (admin)"}
            </button>
          )}
        </div>
        <label className="label cursor-pointer gap-2">
          <span className="label-text text-xs">Show archived</span>
          <input
            type="checkbox"
            className="toggle toggle-xs"
            checked={showArchived}
            onChange={e => setShowArchived(e.target.checked)}
          />
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <span className="loading loading-spinner loading-md"></span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {PHASES.map(({ key, label, emoji }) => {
            const cards = byPhase(key);
            const isDragOver = dragOverPhase === key;
            return (
              <div
                key={key}
                className={`bg-base-200 p-3 min-h-[120px] transition-colors ${
                  isDragOver ? "bg-base-300 ring-2 ring-primary" : ""
                }`}
                onDragOver={e => {
                  if (!canEdit) return;
                  e.preventDefault();
                  setDragOverPhase(key);
                }}
                onDragLeave={() => setDragOverPhase(null)}
                onDrop={e => {
                  if (!canEdit) return;
                  e.preventDefault();
                  const id = parseInt(e.dataTransfer.getData("text/plain"));
                  if (!isNaN(id)) handleDrop(key, id);
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-sm">
                    {emoji} {label}
                  </h3>
                  <span className="text-xs text-base-content/50">{cards.length}</span>
                </div>

                <div className="space-y-2">
                  {cards.map(job => (
                    <div
                      key={job.id}
                      draggable={canEdit && editingId !== job.id}
                      onDragStart={e => {
                        e.dataTransfer.setData("text/plain", String(job.id));
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      className={`bg-base-100 p-2 shadow-sm group ${
                        canEdit ? "cursor-grab active:cursor-grabbing" : ""
                      } ${job.archived ? "opacity-50" : ""}`}
                    >
                      {editingId === job.id ? (
                        <div className="flex flex-col gap-1">
                          <input
                            type="text"
                            className="input input-bordered input-xs rounded-none w-full"
                            value={editTitle}
                            maxLength={140}
                            onChange={e => setEditTitle(e.target.value)}
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === "Enter") handleSaveEdit(job.id);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                          />
                          <div className="flex gap-1">
                            <button className="btn btn-xs btn-primary" onClick={() => handleSaveEdit(job.id)}>
                              Save
                            </button>
                            <button className="btn btn-xs btn-ghost" onClick={() => setEditingId(null)}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm break-words">{job.title}</p>
                          {canEdit && (
                            <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                className="btn btn-xs btn-ghost px-1"
                                title="Edit"
                                onClick={() => {
                                  setEditingId(job.id);
                                  setEditTitle(job.title);
                                }}
                              >
                                ✎
                              </button>
                              <button
                                className="btn btn-xs btn-ghost px-1"
                                title={job.archived ? "Unarchive" : "Archive"}
                                onClick={() => handleArchive(job.id, !job.archived)}
                              >
                                {job.archived ? "↺" : "📦"}
                              </button>
                              <button
                                className="btn btn-xs btn-ghost px-1 text-error"
                                title="Delete"
                                onClick={() => handleDelete(job.id)}
                              >
                                ✕
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}

                  {canEdit && addingTo === key && (
                    <div className="bg-base-100 p-2 shadow-sm">
                      <input
                        type="text"
                        className="input input-bordered input-xs rounded-none w-full mb-1"
                        placeholder="Card title..."
                        value={newTitle}
                        maxLength={140}
                        autoFocus
                        onChange={e => setNewTitle(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") handleAdd(key);
                          if (e.key === "Escape") {
                            setAddingTo(null);
                            setNewTitle("");
                          }
                        }}
                      />
                      <div className="flex gap-1">
                        <button
                          className="btn btn-xs btn-primary"
                          disabled={!newTitle.trim()}
                          onClick={() => handleAdd(key)}
                        >
                          Add
                        </button>
                        <button
                          className="btn btn-xs btn-ghost"
                          onClick={() => {
                            setAddingTo(null);
                            setNewTitle("");
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {canEdit && addingTo !== key && (
                  <button
                    className="btn btn-ghost btn-xs w-full mt-2 text-base-content/60 hover:text-base-content"
                    onClick={() => {
                      setAddingTo(key);
                      setNewTitle("");
                    }}
                  >
                    + Add card
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
