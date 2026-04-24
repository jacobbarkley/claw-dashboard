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
  ProductionLinks,
  PromotionEvent,
} from "@/lib/vires-campaigns"
import { InfoPop } from "./shared"

// ─── Sleeve filter bar ──────────────────────────────────────────────────────
// Shared by campaigns-index AND bench-view so both surfaces get the same
// "All · Stocks · Options · Crypto" tab strip above their per-sleeve lists.

export type SleeveFilter = "ALL" | "STOCKS" | "OPTIONS" | "CRYPTO"

export const SLEEVE_FILTERS: Array<{ k: SleeveFilter; l: string }> = [
  { k: "ALL",     l: "All" },
  { k: "STOCKS",  l: "Stocks" },
  { k: "OPTIONS", l: "Options" },
  { k: "CRYPTO",  l: "Crypto" },
]

export function SleeveFilterBar({
  value,
  onChange,
  counts,
  ariaLabel = "Sleeve filter",
}: {
  value: SleeveFilter
  onChange: (v: SleeveFilter) => void
  counts: Record<string, number> & { ALL: number }
  ariaLabel?: string
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 2,
        padding: 2,
        background: "rgba(241,236,224,0.02)",
        border: "1px solid var(--vr-line)",
        borderRadius: 3,
        alignSelf: "flex-start",
      }}
      role="tablist"
      aria-label={ariaLabel}
    >
      {SLEEVE_FILTERS.map(f => {
        const active = value === f.k
        const n = counts[f.k] ?? 0
        return (
          <button
            key={f.k}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(f.k)}
            className="t-eyebrow"
            style={{
              padding: "5px 11px",
              borderRadius: 2,
              border: "none",
              background: active ? "var(--vr-gold)" : "transparent",
              color: active ? "var(--vr-ink)" : "var(--vr-cream-mute)",
              fontWeight: 600,
              fontSize: 10,
              letterSpacing: "0.14em",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {f.l}
            <span
              style={{
                fontSize: 9,
                opacity: active ? 0.75 : 0.6,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {n}
            </span>
          </button>
        )
      })}
    </div>
  )
}

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
  MONITORED:   { label: "Monitored",   color: "var(--vr-up)",        bg: "rgba(127,194,155,0.08)" },
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

// ─── Promotion events — event type → glyph + label + glossary term ─────────

const PROMOTION_EVENT_META: Record<string, { label: string; glyph: string; term?: string }> = {
  PROMOTION_NOMINATED:   { label: "Nominated",            glyph: "◇", term: "Event_PROMOTION_NOMINATED" },
  PROMOTION_CONFIRMED:   { label: "Promoted",             glyph: "★", term: "Event_PROMOTION_CONFIRMED" },
  PASSPORT_SUPERSEDED:   { label: "Superseded",           glyph: "⤳", term: "Event_PASSPORT_SUPERSEDED" },
  CAMPAIGN_MONITORED:    { label: "Monitored",            glyph: "◎", term: "Event_CAMPAIGN_MONITORED" },
  CAMPAIGN_REOPENED:     { label: "Reopened",             glyph: "↻", term: "Event_CAMPAIGN_REOPENED" },
  DEMOTION_RECOMMENDED:  { label: "Demotion recommended", glyph: "⚠", term: "Event_DEMOTION_RECOMMENDED" },
  DEMOTION_CONFIRMED:    { label: "Demoted",              glyph: "×", term: "Event_DEMOTION_CONFIRMED" },
}

function promotionEventMeta(kind: string): { label: string; glyph: string; term?: string } {
  const meta = PROMOTION_EVENT_META[kind]
  if (meta) return meta
  return { label: kind.toLowerCase().replace(/_/g, " "), glyph: "·" }
}

// ─── Promotion Lineage strip ───────────────────────────────────────────────
// Surfaces the campaign's production-ledger history. Combines
// production_links.history (slot-level: who has held the passport slot and
// when) with promotion_events (event-level: what the bank actually did).
// Renders as a compact vertical timeline; omitted entirely when both are
// empty so new campaigns don't carry a "no activity" placeholder.

export function PromotionLineageStrip({
  productionLinks,
  promotionEvents,
}: {
  productionLinks: ProductionLinks | null | undefined
  promotionEvents: PromotionEvent[] | null | undefined
}) {
  const events = (promotionEvents ?? []).slice().sort(
    (a, b) => Date.parse(b.at) - Date.parse(a.at),
  )
  const slotHistory = productionLinks?.history ?? []
  const activeRecordId = productionLinks?.active_record_id ?? null
  const slotId = productionLinks?.passport_role_id ?? null

  // Honest empty — nothing meaningful to render.
  if (events.length === 0 && slotHistory.length === 0 && !activeRecordId) {
    return null
  }

  return (
    <div className="vr-card" style={{ padding: 0, background: "var(--vr-ink)" }}>
      <div
        style={{
          padding: "12px 16px 10px",
          borderBottom: events.length > 0 ? "1px solid var(--vr-line)" : "none",
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            className="t-eyebrow"
            style={{ fontSize: 9, color: "var(--vr-cream-mute)", marginBottom: 3 }}
          >
            Promotion lineage
          </div>
          <div className="t-h3" style={{ fontSize: 15 }}>
            Who has held the slot
          </div>
        </div>
        {slotId && (
          <div
            className="t-ticker"
            style={{
              fontSize: 9,
              color: "var(--vr-cream-faint)",
              textTransform: "none",
              maxWidth: 180,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={`passport_role_id = ${slotId}`}
          >
            slot · {slotId}
          </div>
        )}
      </div>

      {/* Active record callout (when present). */}
      {activeRecordId && (
        <div
          style={{
            padding: "10px 16px",
            background: "rgba(127,194,155,0.05)",
            borderBottom: events.length > 0 ? "1px solid var(--vr-line)" : "none",
          }}
        >
          <div
            className="t-eyebrow"
            style={{ fontSize: 9, color: "var(--vr-up)", marginBottom: 3 }}
          >
            Active in slot
          </div>
          <div
            className="t-ticker"
            style={{
              fontSize: 11,
              color: "var(--vr-cream)",
              textTransform: "none",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {activeRecordId}
          </div>
        </div>
      )}

      {/* Event rail. */}
      {events.length > 0 && (
        <div style={{ padding: "10px 16px 14px" }}>
          {events.map((e, i) => {
            const meta = promotionEventMeta(e.event_type)
            const isLast = i === events.length - 1
            return (
              <div
                key={e.event_id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "18px 1fr auto",
                  gap: 10,
                  alignItems: "flex-start",
                  paddingTop: i === 0 ? 0 : 8,
                  paddingBottom: isLast ? 0 : 8,
                  borderBottom: isLast ? "none" : "1px dashed var(--vr-line)",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    fontSize: 12,
                    lineHeight: 1.2,
                    color: "var(--vr-cream-mute)",
                    textAlign: "center",
                  }}
                >
                  {meta.glyph}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span
                      className="t-eyebrow"
                      style={{ fontSize: 9, color: "var(--vr-cream-mute)" }}
                    >
                      {meta.label}
                    </span>
                    {meta.term && <InfoPop term={meta.term} size={10} />}
                  </div>
                  {e.notes && (
                    <div
                      className="t-read"
                      style={{
                        fontSize: 12,
                        color: "var(--vr-cream-dim)",
                        lineHeight: 1.45,
                        marginTop: 2,
                      }}
                    >
                      {e.notes}
                    </div>
                  )}
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      alignItems: "center",
                      marginTop: 4,
                    }}
                  >
                    <ActorChip actor={e.actor} />
                    {e.candidate_id && (
                      <span
                        className="t-ticker"
                        style={{
                          fontSize: 9,
                          color: "var(--vr-cream-faint)",
                          textTransform: "none",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: 200,
                        }}
                        title={e.candidate_id}
                      >
                        · {e.candidate_id}
                      </span>
                    )}
                  </div>
                </div>
                <div
                  className="t-eyebrow"
                  style={{
                    fontSize: 9,
                    color: "var(--vr-cream-faint)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {relTime(e.at)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
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
