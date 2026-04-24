"use client"

// Campaign-detail action: Assign promotion slot.
//
// Shown on Lab-spawned campaigns (origin.kind === "LAB_IDEA") that rolled
// up without a promotion target. Writes back to the idea YAML via
// PATCH /api/research/ideas/[id]; Codex's rollup producer picks up the
// change on its next pass and re-emits the manifest with a populated
// promotion_readiness block.
//
// Scope note: we operate in the Phase 1 default scope (jacob/paper_main/
// default). Once multi-scope lands the picker will need to pass the scope
// explicitly — route already accepts it.

import { useRouter } from "next/navigation"
import { useState } from "react"

// Known roles surfaced from the current strategy bank. Operators can still
// type a custom string when the slot they want doesn't exist yet — the
// bank will refuse to promote into an undefined role, which is the correct
// failure mode for that case.
const KNOWN_ROLES = [
  "STOCKS_BROAD_MOMENTUM",
  "CRYPTO_MANAGED_RISK_ADJUSTED",
  "CRYPTO_MANAGED_PERSISTENT_FLOOR",
]

type TargetAction = "NEW_RECORD" | "REPLACE_EXISTING"

export function AssignPromotionSlot({ ideaId }: { ideaId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [roleMode, setRoleMode] = useState<"known" | "custom">("known")
  const [knownRole, setKnownRole] = useState<string>(KNOWN_ROLES[0])
  const [customRole, setCustomRole] = useState<string>("")
  const [targetAction, setTargetAction] = useState<TargetAction>("NEW_RECORD")
  const [supersedes, setSupersedes] = useState<string>("")

  async function submit() {
    setSubmitting(true)
    setError(null)
    const roleId = (roleMode === "custom" ? customRole : knownRole).trim()
    if (!roleId) {
      setError("Pick a passport role.")
      setSubmitting(false)
      return
    }
    if (targetAction === "REPLACE_EXISTING" && !supersedes.trim()) {
      setError("supersedes_record_id is required when replacing an existing record.")
      setSubmitting(false)
      return
    }
    try {
      const res = await fetch(`/api/research/ideas/${encodeURIComponent(ideaId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promotion_target: {
            passport_role_id: roleId,
            target_action: targetAction,
            supersedes_record_id:
              targetAction === "REPLACE_EXISTING" ? supersedes.trim() : null,
          },
        }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setError(data.error ?? `Request failed: ${res.status}`)
        setSubmitting(false)
        return
      }
      setOpen(false)
      setSubmitting(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="t-eyebrow"
        style={{
          padding: "7px 12px",
          fontSize: 10,
          letterSpacing: "0.14em",
          borderRadius: 3,
          border: "1px solid var(--vr-gold-line)",
          background: "var(--vr-gold-soft)",
          color: "var(--vr-gold)",
          cursor: "pointer",
          alignSelf: "flex-start",
        }}
      >
        Assign promotion slot
      </button>
    )
  }

  return (
    <div
      className="vr-card"
      style={{
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        borderLeft: "2px solid var(--vr-gold)",
        background: "rgba(200,169,104,0.04)",
      }}
    >
      <div
        className="t-eyebrow"
        style={{ fontSize: 9, color: "var(--vr-gold)", letterSpacing: "0.14em" }}
      >
        Assign promotion slot
      </div>

      <FieldRow label="Passport role">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label
            className="t-mono"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              color: "var(--vr-cream)",
            }}
          >
            <input
              type="radio"
              name="role_mode"
              checked={roleMode === "known"}
              onChange={() => setRoleMode("known")}
            />
            Known role
          </label>
          {roleMode === "known" && (
            <select
              value={knownRole}
              onChange={e => setKnownRole(e.target.value)}
              className="t-mono"
              style={inputStyle}
            >
              {KNOWN_ROLES.map(r => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          )}
          <label
            className="t-mono"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              color: "var(--vr-cream)",
            }}
          >
            <input
              type="radio"
              name="role_mode"
              checked={roleMode === "custom"}
              onChange={() => setRoleMode("custom")}
            />
            Custom…
          </label>
          {roleMode === "custom" && (
            <input
              value={customRole}
              onChange={e => setCustomRole(e.target.value.toUpperCase())}
              placeholder="STOCKS_NEW_ROLE"
              className="t-mono"
              style={inputStyle}
            />
          )}
        </div>
      </FieldRow>

      <FieldRow label="Target action">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {(["NEW_RECORD", "REPLACE_EXISTING"] as const).map(a => (
            <label
              key={a}
              className="t-mono"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                color: "var(--vr-cream)",
              }}
            >
              <input
                type="radio"
                name="target_action"
                checked={targetAction === a}
                onChange={() => setTargetAction(a)}
              />
              {a.replace("_", " ")}
            </label>
          ))}
        </div>
      </FieldRow>

      {targetAction === "REPLACE_EXISTING" && (
        <FieldRow label="Supersedes record_id">
          <input
            value={supersedes}
            onChange={e => setSupersedes(e.target.value)}
            placeholder="regime_aware_momentum::stop_5_target_15"
            className="t-mono"
            style={inputStyle}
          />
        </FieldRow>
      )}

      {error && (
        <div
          style={{
            fontSize: 11,
            color: "var(--vr-down)",
            padding: "6px 10px",
            border: "1px solid var(--vr-down)",
            borderRadius: 3,
            background: "rgba(212, 80, 80, 0.08)",
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="t-eyebrow"
          style={{
            padding: "7px 12px",
            fontSize: 10,
            letterSpacing: "0.14em",
            borderRadius: 3,
            border: "1px solid var(--vr-gold-line)",
            background: "var(--vr-gold-soft)",
            color: "var(--vr-gold)",
            cursor: submitting ? "wait" : "pointer",
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? "Saving…" : "Save assignment"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setError(null)
          }}
          disabled={submitting}
          className="t-eyebrow"
          style={{
            padding: "7px 12px",
            fontSize: 10,
            letterSpacing: "0.14em",
            borderRadius: 3,
            border: "1px solid var(--vr-line)",
            background: "transparent",
            color: "var(--vr-cream-mute)",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>

      <div
        className="t-read"
        style={{ fontSize: 10.5, lineHeight: 1.5, color: "var(--vr-cream-faint)" }}
      >
        Saved to the underlying idea. The rollup producer picks up the new
        target on its next pass and refreshes the campaign&apos;s promotion
        readiness block.
      </div>
    </div>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        className="t-eyebrow"
        style={{ fontSize: 9, color: "var(--vr-cream-mute)", letterSpacing: "0.14em" }}
      >
        {label}
      </div>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 9px",
  background: "var(--vr-ink)",
  border: "1px solid var(--vr-line)",
  borderRadius: 3,
  color: "var(--vr-cream)",
  fontFamily: "var(--ff-mono)",
  width: "100%",
  boxSizing: "border-box",
}
