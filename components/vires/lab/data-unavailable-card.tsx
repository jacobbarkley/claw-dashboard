"use client"

// Renders the 422 data_unavailable response from
// POST /api/research/specs/draft-with-talon. Talon refused to draft
// because the strategy depends on data we don't have wired in yet.
// Operator sees the missing requirements + a suggested next step;
// the "Author the spec yourself" path stays available alongside.

interface DataUnavailableRequirement {
  requested: string
  status: "AVAILABLE" | "PARTIAL" | "MISSING"
  source?: string | null
  notes?: string | null
}

export interface DataUnavailableCardProps {
  catalogVersion: string
  blockingSummary: string
  suggestedAction: string
  requirements: DataUnavailableRequirement[]
  onDismiss: () => void
}

export function DataUnavailableCard({
  catalogVersion,
  blockingSummary,
  suggestedAction,
  requirements,
  onDismiss,
}: DataUnavailableCardProps) {
  const missing = requirements.filter(r => r.status === "MISSING")
  const partial = requirements.filter(r => r.status === "PARTIAL")

  return (
    <div
      className="vr-card"
      style={{
        padding: "16px 16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        borderLeft: "2px solid var(--vr-down)",
        background: "rgba(220,90,90,0.04)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div
          style={{
            fontFamily: "var(--ff-serif)",
            fontStyle: "italic",
            fontSize: 18,
            color: "var(--vr-cream)",
          }}
        >
          Talon couldn&apos;t draft this — required data isn&apos;t wired in yet
        </div>
        <span
          className="t-eyebrow"
          style={{
            padding: "3px 8px",
            fontSize: 9,
            letterSpacing: "0.08em",
            borderRadius: 2,
            border: "1px solid var(--vr-down)",
            color: "var(--vr-down)",
            whiteSpace: "nowrap",
          }}
        >
          BLOCKED
        </span>
      </div>

      <div style={{ fontSize: 12, color: "var(--vr-cream-dim)", lineHeight: 1.55 }}>
        {blockingSummary}
      </div>

      {missing.length > 0 && (
        <RequirementSection
          label="Missing"
          tone="down"
          rows={missing}
        />
      )}

      {partial.length > 0 && (
        <RequirementSection
          label="Partial"
          tone="gold"
          rows={partial}
        />
      )}

      <div
        style={{
          padding: "10px 12px",
          background: "var(--vr-ink)",
          border: "1px solid var(--vr-line)",
          borderRadius: 3,
          fontSize: 11.5,
          color: "var(--vr-cream-dim)",
          lineHeight: 1.55,
          fontStyle: "italic",
          fontFamily: "var(--ff-serif)",
        }}
      >
        {suggestedAction}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginTop: 4,
        }}
      >
        <span
          className="t-mono"
          style={{ fontSize: 9.5, color: "var(--vr-cream-faint)", letterSpacing: "0.04em" }}
        >
          catalog · {catalogVersion}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          style={{
            padding: "6px 12px",
            fontSize: 11,
            fontFamily: "var(--ff-mono)",
            background: "transparent",
            border: "1px solid var(--vr-line)",
            color: "var(--vr-cream-mute)",
            borderRadius: 3,
            cursor: "pointer",
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

function RequirementSection({
  label,
  tone,
  rows,
}: {
  label: string
  tone: "down" | "gold"
  rows: DataUnavailableRequirement[]
}) {
  const accent = tone === "down" ? "var(--vr-down)" : "var(--vr-gold)"
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        className="t-eyebrow"
        style={{ fontSize: 9, color: accent, letterSpacing: "0.14em" }}
      >
        {label}
      </div>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {rows.map((row, idx) => (
          <li
            key={`${row.requested}-${idx}`}
            style={{
              fontSize: 11.5,
              color: "var(--vr-cream)",
              lineHeight: 1.5,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span className="t-mono" style={{ fontFamily: "var(--ff-mono)" }}>
              {row.requested}
            </span>
            {row.notes && (
              <span style={{ color: "var(--vr-cream-mute)" }}>— {row.notes}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
