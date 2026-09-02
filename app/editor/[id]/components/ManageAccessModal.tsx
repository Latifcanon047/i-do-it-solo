"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Loader2, Plus, Trash2, Copy, Check } from "lucide-react";
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

  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const hasLoadedRef = useRef(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");

  const fetchAccessList = useCallback(
    async (signal?: AbortSignal) => {
      if (!hasLoadedRef.current) setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/mindmaps/${mindMapId}/collaborators`, {
          signal,
        });
        if (!res.ok) throw new Error("Gagal memuat daftar akses.");
        const data = await res.json();
        setCollaborators(data.collaborators ?? []);
        setPendingInvites(data.pendingInvites ?? []);
        hasLoadedRef.current = true;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof Error ? err.message : "Gagal memuat daftar akses.",
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
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

  async function handleCopyLink() {
    try {
      const url = `${window.location.origin}/editor/${mindMapId}`;
      await navigator.clipboard.writeText(url);
      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 2000);
    } catch {
      alert("Gagal menyalin link.");
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

  function markProcessing(id: string, processing: boolean) {
    setProcessingIds((prev) => {
      const next = new Set(prev);
      if (processing) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function setRowError(id: string, message: string | null) {
    setRowErrors((prev) => {
      const next = { ...prev };
      if (message) next[id] = message;
      else delete next[id];
      return next;
    });
  }

  async function handleCollaboratorRoleChange(
    collaboratorId: string,
    newRole: "EDITOR" | "VIEWER",
  ) {
    setRowError(collaboratorId, null);
    markProcessing(collaboratorId, true);
    try {
      const res = await fetch(
        `/api/mindmaps/${mindMapId}/collaborators/${collaboratorId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: newRole }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setRowError(collaboratorId, data.error || "Gagal mengubah role.");
        return;
      }
      await fetchAccessList();
    } catch {
      setRowError(collaboratorId, "Gagal mengubah role, coba lagi.");
    } finally {
      markProcessing(collaboratorId, false);
    }
  }

  async function handleRemoveCollaborator(collaboratorId: string) {
    setRowError(collaboratorId, null);
    markProcessing(collaboratorId, true);
    try {
      const res = await fetch(
        `/api/mindmaps/${mindMapId}/collaborators/${collaboratorId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setRowError(
          collaboratorId,
          data.error || "Gagal menghapus collaborator.",
        );
        return;
      }
      await fetchAccessList();
    } catch {
      setRowError(collaboratorId, "Gagal menghapus collaborator, coba lagi.");
    } finally {
      markProcessing(collaboratorId, false);
    }
  }

  async function handleCancelInvite(pendingInviteId: string) {
    setRowError(pendingInviteId, null);
    markProcessing(pendingInviteId, true);
    try {
      const res = await fetch(
        `/api/mindmaps/${mindMapId}/pending-invites/${pendingInviteId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setRowError(
          pendingInviteId,
          data.error || "Gagal membatalkan undangan.",
        );
        return;
      }
      await fetchAccessList();
    } catch {
      setRowError(pendingInviteId, "Gagal membatalkan undangan, coba lagi.");
    } finally {
      markProcessing(pendingInviteId, false);
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
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-800">
              Manage Access
            </h2>
            {isOwner && (
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                title="Salin link mindmap"
              >
                {copyStatus === "copied" ? (
                  <>
                    <Check size={13} className="text-green-600" />
                    <span className="text-green-600">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy size={13} />
                    <span>Copy link</span>
                  </>
                )}
              </button>
            )}
          </div>
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
            <div className="animate-pulse space-y-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-2 py-1.5"
                >
                  <div className="space-y-1.5">
                    <div className="h-3 w-32 rounded bg-gray-200" />
                    <div className="h-2.5 w-40 rounded bg-gray-100" />
                  </div>
                  <div className="h-4 w-14 rounded-full bg-gray-200" />
                </div>
              ))}
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
                    {collaborators.map((c) => {
                      const isProcessing = processingIds.has(c.id);
                      const rowError = rowErrors[c.id];
                      return (
                        <li
                          key={c.id}
                          className="rounded-lg px-2 py-1.5 hover:bg-gray-50"
                        >
                          <div
                            className={`flex items-center justify-between ${
                              isProcessing
                                ? "pointer-events-none opacity-60"
                                : ""
                            }`}
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
                              {isOwner ? (
                                <select
                                  value={c.role}
                                  disabled={isProcessing}
                                  onChange={(e) =>
                                    handleCollaboratorRoleChange(
                                      c.id,
                                      e.target.value as "EDITOR" | "VIEWER",
                                    )
                                  }
                                  className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600 focus:border-blue-400 focus:outline-none"
                                >
                                  <option value="EDITOR">Editor</option>
                                  <option value="VIEWER">Viewer</option>
                                </select>
                              ) : (
                                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                                  {c.role === "EDITOR" ? "Editor" : "Viewer"}
                                </span>
                              )}
                              {isOwner && (
                                <button
                                  onClick={() => handleRemoveCollaborator(c.id)}
                                  disabled={isProcessing}
                                  className="shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-red-500"
                                  title="Remove"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                          {rowError && (
                            <p className="mt-1 text-xs text-red-500">
                              {rowError}
                            </p>
                          )}
                        </li>
                      );
                    })}
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
                    {pendingInvites.map((p) => {
                      const isProcessing = processingIds.has(p.id);
                      const rowError = rowErrors[p.id];
                      return (
                        <li
                          key={p.id}
                          className="rounded-lg px-2 py-1.5 hover:bg-gray-50"
                        >
                          <div
                            className={`flex items-center justify-between ${
                              isProcessing
                                ? "pointer-events-none opacity-60"
                                : ""
                            }`}
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
                                <button
                                  onClick={() => handleCancelInvite(p.id)}
                                  disabled={isProcessing}
                                  className="shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-red-500"
                                  title="Cancel"
                                >
                                  <X size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                          {rowError && (
                            <p className="mt-1 text-xs text-red-500">
                              {rowError}
                            </p>
                          )}
                        </li>
                      );
                    })}
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
