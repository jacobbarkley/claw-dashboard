"use client"

// Shared primitives for the Bench Campaigns surface (Index + Detail).
// Ported from design_handoff_vires_capital/files/vires-campaigns.jsx, typed
// for TypeScript and extended to cover the v2 producer contract from
// campaigns/PRIMER_v2_campaign_contract.md.

import type {
  Actor,
  CandidateRole,
  ChangeKind,
  ChangeLogEvent,
  CampaignStatus,
  LeaderComparisonStatus,
  CampaignPressureStatus,
} from "@/lib/vires-campaigns"

// ─── Time formatting ────────────────────────────────────────────────────────

export function relTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  const ts = Date.parse(iso)
  if (!Number.isFinite(ts)) return "—"
  const diff = Date.now() - ts
  if (diff < 60_000) return "just now"
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

// ─── Status pill (campaign-scope) ───────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  EXPLORING:   { label: "Exploring",   color: "var(--vr-cream-dim)", bg: "rgba(241,236,224,0.04)" },
  CONVERGING:  { label: "Converging",  color: "var(--vr-gold)",      bg: "rgba(200,169,104,0.08)" },
  PROMOTED:    { label: "Promoted",    color: "var(--vr-up)",        bg: "rgba(127,194,155,0.08)" },
  RETIRED:     { label: "Retired",     color: "var(--vr-cream-mute)", bg: "rgba(241,236,224,0.02)" },
}

export function StatusPillCampaign({ status }: { status: CampaignStatus }) {
  const key = (status || "").toString().toUpperCase()
  const meta = STATUS_META[key] ?? { label: key || "—", color: "var(--vr-cream-mute)", bg: "rgba(241,236,224,0.02)" }
  return (
    <span
      className="t-eyebrow"
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 8px 2px",
        background: meta.bg,
        color: meta.color,
        borderRadius: 2,
        border: `1px solid ${meta.color}22`,
      }}
    >
      {meta.label}
    </span>
  )
}

// ─── Role tag — LEADER vs CHALLENGER vs PROMOTED_REFERENCE ──────────────────
// Contract-critical: these three must read differently at a glance.

export function RoleTag({ role }: { role: CandidateRole }) {
  if (role === "PROMOTED_REFERENCE") {
    // Filled gold block — "this IS production"
    return (
      <span
        className="t-eyebrow"
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "3px 8px 2px",
          background: "var(--vr-gold)",
          color: "var(--vr-ink)",
          fontWeight: 600,
          borderRadius: 2,
          letterSpacing: "0.14em",
        }}
      >
        Baseline
      </span>
    )
  }
  if (role === "LEADER") {
    // Hairline gold — "currently ahead in research"
    return (
      <span
        className="t-eyebrow"
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "3px 8px 2px",
          color: "var(--vr-gold)",
          border: "1px solid var(--vr-gold-line, rgba(200,169,104,0.4))",
          borderRadius: 2,
          letterSpacing: "0.14em",
        }}
      >
        Leading
      </span>
    )
  }
  // CHALLENGER (or unknown) — cream outline
  return (
    <span
      className="t-eyebrow"
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 8px 2px",
        color: "var(--vr-cream-dim)",
        border: "1px solid var(--vr-line-hi, rgba(241,236,224,0.16))",
        borderRadius: 2,
        letterSpacing: "0.14em",
      }}
    >
      {role === "CHALLENGER" ? "Challenger" : String(role).toLowerCase()}
    </span>
  )
}

// ─── Actor chip — neutral tonal treatment (codex/claude/user/openclaw) ──────
// Per the rev-3 contract: every actor renders with identical visual weight.
// `user` is NOT highlighted.

const KNOWN_ACTORS = new Set(["codex", "claude", "user", "openclaw"])

export function ActorChip({ actor }: { actor: Actor | null | undefined }) {
  const raw = (actor ?? "").toString().toLowerCase()
  const known = KNOWN_ACTORS.has(raw)
  return (
    <span
      className="t-eyebrow"
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 8px 2px",
        color: "var(--vr-cream-dim)",
        border: "1px solid var(--vr-line)",
        borderRadius: 2,
        letterSpacing: "0.14em",
        fontSize: 9,
        opacity: known ? 1 : 0.7,
      }}
    >
      {raw || "—"}
    </span>
  )
}

// ─── Change-log icons ───────────────────────────────────────────────────────

export const CHANGE_META: Record<string, { label: string; glyph: string }> = {
  LEADER_CHANGED:             { label: "Leader changed",    glyph: "↔" },
  PROMOTION_REFERENCE_ADDED:  { label: "Reference promoted", glyph: "★" },
  CANDIDATE_ADDED:            { label: "Candidate added",   glyph: "+" },
  BENCHMARK_UPDATED:          { label: "Benchmark updated", glyph: "◎" },
  CANDIDATE_RETIRED:          { label: "Candidate retired", glyph: "×" },
}

export function changeMeta(kind: ChangeKind): { label: string; glyph: string } {
  const meta = CHANGE_META[kind]
  if (meta) return meta
  const humanized = String(kind).toLowerCase().replace(/_/g, " ")
  return { label: humanized, glyph: "·" }
}

// ─── Campaign pressure chip (v2) ────────────────────────────────────────────

const PRESSURE_META: Record<CampaignPressureStatus, { label: string; color: string }> = {
  BASELINE_CLEARLY_AHEAD:               { label: "Baseline clearly ahead",      color: "var(--vr-cream-dim)" },
  CHALLENGER_WITHIN_STRIKING_DISTANCE:  { label: "Challenger in striking distance", color: "var(--vr-gold)" },
  LEADER_NOT_YET_QUALITY_GATED:         { label: "Leader not yet gated",        color: "var(--vr-gold)" },
  LEADER_APPROACHING_PROMOTION:         { label: "Approaching promotion",       color: "var(--vr-up)" },
  NEEDS_FRESH_RUNS:                     { label: "Needs fresh runs",            color: "var(--vr-cream-mute)" },
  EXPLORATORY:                          { label: "Exploratory",                 color: "var(--vr-cream-mute)" },
}

export function PressureChip({ status }: { status: CampaignPressureStatus }) {
  const meta = PRESSURE_META[status] ?? { label: String(status), color: "var(--vr-cream-mute)" }
  return (
    <span
      className="t-eyebrow"
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 8px 2px",
        color: meta.color,
        border: `1px solid ${meta.color}22`,
        borderRadius: 2,
        letterSpacing: "0.14em",
        fontSize: 9,
      }}
    >
      {meta.label}
    </span>
  )
}

// ─── Leader-vs-baseline comparison chip (v2) ────────────────────────────────

const COMPARISON_META: Record<LeaderComparisonStatus, { label: string; color: string }> = {
  AHEAD:                  { label: "Ahead",           color: "var(--vr-up)" },
  MIXED:                  { label: "Mixed",           color: "var(--vr-gold)" },
  NOT_YET_AHEAD:          { label: "Not yet ahead",   color: "var(--vr-cream-mute)" },
  INSUFFICIENT_EVIDENCE:  { label: "Gap not quantified", color: "var(--vr-cream-mute)" },
}

export function LeaderComparisonChip({ status }: { status: LeaderComparisonStatus }) {
  const meta = COMPARISON_META[status] ?? { label: String(status), color: "var(--vr-cream-mute)" }
  return (
    <span
      className="t-eyebrow"
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 8px 2px",
        color: meta.color,
        border: `1px solid ${meta.color}22`,
        borderRadius: 2,
        letterSpacing: "0.14em",
        fontSize: 9,
      }}
    >
      {meta.label}
    </span>
  )
}

// ─── Change-log row (preview-size, used in index card) ──────────────────────

export function ChangeLogPreviewRow({ event }: { event: ChangeLogEvent }) {
  const meta = changeMeta(event.kind)
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, paddingTop: 6 }}>
      <span
        aria-hidden
        style={{
          fontSize: 11,
          lineHeight: 1.2,
          color: "var(--vr-cream-mute)",
          width: 14,
          display: "inline-block",
          textAlign: "center",
        }}
      >
        {meta.glyph}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span
            className="t-eyebrow"
            style={{ fontSize: 9, color: "var(--vr-cream-mute)" }}
          >
            {meta.label}
          </span>
          <span
            className="t-eyebrow"
            style={{ fontSize: 9, color: "var(--vr-cream-faint)" }}
          >
            {relTime(event.at)}
          </span>
        </div>
        <div
          className="t-read"
          style={{
            fontSize: 12,
            color: "var(--vr-cream-dim)",
            lineHeight: 1.45,
            marginTop: 2,
          }}
        >
          {event.title}
        </div>
      </div>
    </div>
  )
}
