"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Loader2, Plus, Trash2 } from "lucide-react";
interface Collaborator {
  id: string;
  mindMapId: string;
  userId: string;
  role: "EDITOR" | "VIEWER";
  invitedAt: string;
  user: { id: string; name: string; email: string };
}

interface PendingInvite {
  id: string;
  mindMapId: string;
  email: string;
  role: "EDITOR" | "VIEWER";
  invitedAt: string;
  expiresAt: string;
}

interface InviteRow {
  email: string;
  role: "EDITOR" | "VIEWER";
}

interface InviteResult {
  email: string;
  success: boolean;
  type?: "collaborator" | "pendingInvite";
  error?: string;
}

interface Props {
  mindMapId: string;
  role: "OWNER" | "EDITOR" | "VIEWER";
  onClose: () => void;
}

export default function ManageAccessModal({ mindMapId, role, onClose }: Props) {
  const isOwner = role === "OWNER";
  const modalRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);

  const [inviteRows, setInviteRows] = useState<InviteRow[]>([
    { email: "", role: "EDITOR" },
  ]);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteResults, setInviteResults] = useState<InviteResult[] | null>(
    null,
  );
  const [inviteFormError, setInviteFormError] = useState<string | null>(null);

  const fetchAccessList = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/mindmaps/${mindMapId}/collaborators`, {
          signal,
        });
        if (!res.ok) throw new Error("Gagal memuat daftar akses.");
        const data = await res.json();
        setCollaborators(data.collaborators ?? []);
        setPendingInvites(data.pendingInvites ?? []);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof Error ? err.message : "Gagal memuat daftar akses.",
        );
      } finally {
        setLoading(false);
      }
    },
    [mindMapId],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchAccessList(controller.signal);
    return () => controller.abort();
  }, [fetchAccessList]);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  function handleBackdropClick(e: React.MouseEvent) {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  }

  function handleAddRow() {
    setInviteRows((rows) => [...rows, { email: "", role: "EDITOR" }]);
  }

  function handleRemoveRow(index: number) {
    setInviteRows((rows) => rows.filter((_, i) => i !== index));
  }

  function handleEmailChange(index: number, value: string) {
    setInviteRows((rows) =>
      rows.map((row, i) => (i === index ? { ...row, email: value } : row)),
    );
  }

  function handleRoleChange(index: number, value: "EDITOR" | "VIEWER") {
    setInviteRows((rows) =>
      rows.map((row, i) => (i === index ? { ...row, role: value } : row)),
    );
  }

  async function handleSubmitInvites() {
    setInviteFormError(null);
    setInviteResults(null);

    const trimmedRows = inviteRows
      .map((r) => ({ email: r.email.trim(), role: r.role }))
      .filter((r) => r.email !== "");

    if (trimmedRows.length === 0) {
      setInviteFormError("Isi minimal 1 email.");
      return;
    }

    const emailsLower = trimmedRows.map((r) => r.email.toLowerCase());
    const hasDuplicate = new Set(emailsLower).size !== emailsLower.length;
    if (hasDuplicate) {
      setInviteFormError("Ada email yang duplikat di daftar undangan ini.");
      return;
    }

    setInviteSubmitting(true);
    try {
      const res = await fetch(`/api/mindmaps/${mindMapId}/collaborators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invites: trimmedRows }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteFormError(data.error || "Gagal mengirim undangan.");
        return;
      }

      setInviteResults(data.results ?? []);
      setInviteRows([{ email: "", role: "EDITOR" }]);
      await fetchAccessList();
    } catch {
      setInviteFormError("Gagal mengirim undangan, coba lagi.");
    } finally {
      setInviteSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="w-full max-w-md rounded-xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-800">Manage Access</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {isOwner && !loading && !error && (
            <div className="mb-5 rounded-lg border border-gray-200 p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                Invite people
              </p>

              <div className="space-y-2">
                {inviteRows.map((row, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="email"
                      placeholder="email@contoh.com"
                      value={row.email}
                      onChange={(e) => handleEmailChange(index, e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-800 focus:border-blue-400 focus:outline-none"
                    />
                    <select
                      value={row.role}
                      onChange={(e) =>
                        handleRoleChange(
                          index,
                          e.target.value as "EDITOR" | "VIEWER",
                        )
                      }
                      className="shrink-0 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-700 focus:border-blue-400 focus:outline-none"
                    >
                      <option value="EDITOR">Editor</option>
                      <option value="VIEWER">Viewer</option>
                    </select>
                    <button
                      onClick={() => handleRemoveRow(index)}
                      disabled={inviteRows.length === 1}
                      className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
                      title="Hapus baris"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={handleAddRow}
                className="mt-2 flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                <Plus size={13} />
                Tambah email
              </button>

              {inviteFormError && (
                <p className="mt-2 text-xs text-red-500">{inviteFormError}</p>
              )}

              {inviteResults && (
                <ul className="mt-2 space-y-1">
                  {inviteResults.map((r, i) => (
                    <li
                      key={i}
                      className={`text-xs ${
                        r.success ? "text-green-600" : "text-red-500"
                      }`}
                    >
                      {r.email}:{" "}
                      {r.success
                        ? r.type === "collaborator"
                          ? "berhasil ditambahkan"
                          : "undangan terkirim"
                        : r.error}
                    </li>
                  ))}
                </ul>
              )}

              <button
                onClick={handleSubmitInvites}
                disabled={inviteSubmitting}
                className="mt-3 w-full rounded-lg bg-blue-600 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {inviteSubmitting ? "Mengirim..." : "Kirim undangan"}
              </button>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <Loader2 size={20} className="animate-spin" />
            </div>
          )}

          {!loading && error && (
            <p className="py-4 text-sm text-red-500">{error}</p>
          )}

          {!loading && !error && (
            <>
              <section>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                  People with access
                </h3>
                {collaborators.length === 0 ? (
                  <p className="text-sm text-gray-400">
                    Belum ada collaborator.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {collaborators.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-gray-50"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-800">
                            {c.user.name}
                          </p>
                          <p className="truncate text-xs text-gray-400">
                            {c.user.email}
                          </p>
                        </div>
                        <div className="ml-2 flex shrink-0 items-center gap-2">
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                            {c.role === "EDITOR" ? "Editor" : "Viewer"}
                          </span>
                          {isOwner && (
                            <span className="text-xs text-gray-300">
                              (aksi: Langkah E)
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="mt-5">
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                  Pending invites
                </h3>
                {pendingInvites.length === 0 ? (
                  <p className="text-sm text-gray-400">
                    Tidak ada undangan tertunda.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {pendingInvites.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-gray-50"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-800">
                            {p.email}
                          </p>
                          <p className="truncate text-xs text-gray-400">
                            Menunggu diterima
                          </p>
                        </div>
                        <div className="ml-2 flex shrink-0 items-center gap-2">
                          <span className="rounded-full bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-700">
                            {p.role === "EDITOR" ? "Editor" : "Viewer"}
                          </span>
                          {isOwner && (
                            <span className="text-xs text-gray-300">
                              (aksi: Langkah E)
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
