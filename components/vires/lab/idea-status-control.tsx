"use client"

// Operator-side status + lifecycle control for an idea.v1.
//
// Renders a small chevron button next to the status chip on the detail
// page. On open, lists:
//   - allowed status transitions (operator-only; system-driven
//     QUEUED/ACTIVE excluded)
//   - delete (hard) when the idea is DRAFT or SHELVED and has no Lab
//     campaign referencing it (server enforces; UI just exposes)
//
// Code-pending ideas can't move to READY — that target is rendered
// disabled with a note so the operator understands why.

import { useState } from "react"
import { useRouter } from "next/navigation"

import type { IdeaStatus } from "@/lib/research-lab-contracts"

// Mirrors the OPERATOR_ALLOWED_TRANSITIONS map in
// app/api/research/ideas/[id]/route.ts. Keep these in lockstep.
const OPERATOR_ALLOWED_TRANSITIONS: Record<IdeaStatus, IdeaStatus[]> = {
  DRAFT:   ["READY", "SHELVED", "RETIRED"],
  READY:   ["DRAFT", "SHELVED", "RETIRED"],
  QUEUED:  ["SHELVED", "RETIRED"],
  ACTIVE:  ["SHELVED", "RETIRED"],
  SHELVED: ["DRAFT", "RETIRED"],
  RETIRED: [],
}

const TRANSITION_COPY: Record<IdeaStatus, { verb: string; note: string }> = {
  DRAFT:   { verb: "Back to draft",  note: "Pull out of the autopilot eligibility set." },
  READY:   { verb: "Mark ready",     note: "Make this idea eligible for autopilot pickup." },
  QUEUED:  { verb: "Queue",          note: "Set by autopilot, not operator-writable." },
  ACTIVE:  { verb: "Activate",       note: "Set by the lab when a job starts." },
  SHELVED: { verb: "Shelve",         note: "Pause without retiring. Resurrect to DRAFT later." },
  RETIRED: { verb: "Retire",         note: "Mark dead. Won't show in the active idea list." },
}

interface Props {
  ideaId: string
  currentStatus: IdeaStatus
  codePending: boolean
}

// Hard-delete is only offered from these states. Server still enforces
// the same rule + the campaign-linked check.
const DELETABLE_FROM: IdeaStatus[] = ["DRAFT", "SHELVED"]

export function IdeaStatusControl({ ideaId, currentStatus, codePending }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<IdeaStatus | "DELETE" | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allowed = OPERATOR_ALLOWED_TRANSITIONS[currentStatus] ?? []
  const deletable = DELETABLE_FROM.includes(currentStatus)
  if (allowed.length === 0 && !deletable) return null

  const apply = async (next: IdeaStatus) => {
    setBusy(next)
    setError(null)
    try {
      const res = await fetch(`/api/research/ideas/${encodeURIComponent(ideaId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        setError(data.error ?? `HTTP ${res.status}`)
        setBusy(null)
        return
      }
      setOpen(false)
      setBusy(null)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error")
      setBusy(null)
    }
  }

  const performDelete = async () => {
    setBusy("DELETE")
    setError(null)
    try {
      const res = await fetch(`/api/research/ideas/${encodeURIComponent(ideaId)}`, {
        method: "DELETE",
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        setError(data.error ?? `HTTP ${res.status}`)
        setBusy(null)
        return
      }
      // Idea is gone — bounce back to the ideas list. router.refresh()
      // would 404 on the current detail page.
      router.push("/vires/bench/lab/ideas")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error")
      setBusy(null)
    }
  }

  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="Manage idea status"
        aria-expanded={open}
        style={{
          marginLeft: 4,
          padding: "2px 6px",
          fontSize: 11,
          letterSpacing: "0.04em",
          fontFamily: "var(--ff-mono)",
          background: "transparent",
          border: "1px solid var(--vr-line)",
          borderRadius: 2,
          color: "var(--vr-cream-mute)",
          cursor: "pointer",
          lineHeight: 1.2,
        }}
      >
        {open ? "▾" : "⋯"}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 6,
            minWidth: 240,
            padding: 6,
            background: "var(--vr-ink-raised)",
            border: "1px solid var(--vr-line-hi)",
            borderRadius: "var(--r-inset)",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
            zIndex: 20,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {allowed.map(target => {
            const blockedByCodePending = codePending && target === "READY"
            const disabled = blockedByCodePending || busy != null
            const meta = TRANSITION_COPY[target]
            return (
              <button
                key={target}
                type="button"
                role="menuitem"
                onClick={() => !disabled && apply(target)}
                disabled={disabled}
                style={{
                  textAlign: "left",
                  padding: "8px 10px",
                  background: "transparent",
                  border: "none",
                  borderRadius: "var(--r-inset)",
                  color: blockedByCodePending ? "var(--vr-cream-faint)" : "var(--vr-cream)",
                  cursor: disabled ? "not-allowed" : "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
                onMouseEnter={e => {
                  if (!disabled) e.currentTarget.style.background = "var(--vr-line)"
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = "transparent"
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--ff-serif)",
                    fontStyle: "italic",
                    fontSize: 13,
                  }}
                >
                  {meta.verb}
                </span>
                <span style={{ fontSize: 10.5, color: "var(--vr-cream-mute)" }}>
                  {blockedByCodePending
                    ? "Blocked while code is pending — implement the strategy first."
                    : busy === target
                      ? "Saving…"
                      : meta.note}
                </span>
              </button>
            )
          })}
          {deletable && (
            <>
              <div
                style={{
                  height: 1,
                  background: "var(--vr-line)",
                  margin: "4px 6px",
                }}
              />
              {confirmDelete ? (
                <div style={{ padding: "8px 10px" }}>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--vr-cream)",
                      lineHeight: 1.45,
                      marginBottom: 8,
                      fontFamily: "var(--ff-serif)",
                      fontStyle: "italic",
                    }}
                  >
                    Permanently delete this idea? This can&apos;t be undone.
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      onClick={performDelete}
                      disabled={busy === "DELETE"}
                      style={{
                        flex: 1,
                        padding: "6px 10px",
                        background: "var(--vr-down-soft)",
                        border: "1px solid var(--vr-down)",
                        borderRadius: "var(--r-inset)",
                        color: "var(--vr-down)",
                        fontSize: 10.5,
                        fontFamily: "var(--ff-mono)",
                        cursor: busy === "DELETE" ? "wait" : "pointer",
                      }}
                    >
                      {busy === "DELETE" ? "Deleting…" : "Yes, delete"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      disabled={busy === "DELETE"}
                      style={{
                        flex: 1,
                        padding: "6px 10px",
                        background: "transparent",
                        border: "1px solid var(--vr-line-hi)",
                        borderRadius: "var(--r-inset)",
                        color: "var(--vr-cream-mute)",
                        fontSize: 10.5,
                        fontFamily: "var(--ff-mono)",
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setConfirmDelete(true); setError(null) }}
                  disabled={busy != null}
                  style={{
                    textAlign: "left",
                    padding: "8px 10px",
                    background: "transparent",
                    border: "none",
                    borderRadius: "var(--r-inset)",
                    color: "var(--vr-down)",
                    cursor: busy != null ? "not-allowed" : "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                  onMouseEnter={e => {
                    if (busy == null) e.currentTarget.style.background = "var(--vr-down-soft)"
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = "transparent"
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--ff-serif)",
                      fontStyle: "italic",
                      fontSize: 13,
                    }}
                  >
                    Delete
                  </span>
                  <span style={{ fontSize: 10.5, color: "var(--vr-cream-mute)" }}>
                    Remove permanently. Use Retire instead if it might come back.
                  </span>
                </button>
              )}
            </>
          )}
          {error && (
            <div
              style={{
                marginTop: 4,
                padding: "6px 10px",
                fontSize: 10.5,
                color: "var(--vr-down)",
                background: "var(--vr-down-soft)",
                borderRadius: "var(--r-inset)",
                lineHeight: 1.4,
              }}
            >
              {error}
            </div>
          )}
        </div>
      )}
    </span>
  )
}
