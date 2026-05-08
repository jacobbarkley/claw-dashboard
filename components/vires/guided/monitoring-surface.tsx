"use client"

import type { GuidedEnrollmentView } from "./types"
import {
  EvidenceCard,
  FieldEyebrow,
  GuidedHeroCard,
  PendingUserActionsBanner,
  SectionLabel,
  formatUsd,
} from "./shared"

const COLD_START_DAYS_THRESHOLD = 5

// S10 — Paper monitoring readback. Shows evidence as 5 dimensions (never
// collapsed) with the cold-start tracker explicit. Backing-strategy state
// + mandate disclosure block close the "starter strategy ≠ starter
// product" gap on the read surface.

export function MonitoringSurface({ view }: { view: GuidedEnrollmentView }) {
  const evidenceByType = groupBy(view.disclosure.evidence_summary, e => e.evidence_type)

  return (
    <GuidedHeroCard>
      <FieldEyebrow>Evidence — never one number</FieldEyebrow>
      <h1
        style={{
          fontSize: 22,
          fontFamily: "var(--ff-serif)",
          fontStyle: "italic",
          color: "var(--vr-cream, #f1ece0)",
          fontWeight: 400,
          marginTop: 6,
          marginBottom: 18,
        }}
      >
        {view.library_entry.friendly_name}
      </h1>

      {Object.entries(evidenceByType).map(([type, items]) => (
        <div key={type}>
          <SectionLabel>{labelForType(type)}</SectionLabel>
          {items.map(e => (
            <EvidenceCard key={e.evidence_id} evidence={e} />
          ))}
        </div>
      ))}

      {/* Live observation — explicit "none" if no LIVE_OBSERVED yet */}
      {!evidenceByType["LIVE_OBSERVED"] ? (
        <>
          <SectionLabel>Live observation</SectionLabel>
          <div
            style={{
              padding: 14,
              border: "1px dashed var(--vr-line, #2a2438)",
              borderRadius: 3,
              background: "rgba(241,236,224,0.02)",
              marginBottom: 14,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "var(--vr-cream-mute, #8c8579)",
                lineHeight: 1.6,
              }}
            >
              None. This strategy has not been run with real money.
            </div>
          </div>
        </>
      ) : null}

      {view.pending_user_actions.length > 0 ? (
        <PendingUserActionsBanner actions={view.pending_user_actions} />
      ) : null}

      {/* Cold-start tracker — explicit honesty about paper observation */}
      <SectionLabel>Cold-start tracker</SectionLabel>
      <div
        style={{
          padding: 14,
          border: `1px ${view.paper_observation_days_count < COLD_START_DAYS_THRESHOLD ? "dashed" : "solid"} var(--vr-line, #2a2438)`,
          borderRadius: 3,
          background: "rgba(241,236,224,0.02)",
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: view.paper_observation_days_count < COLD_START_DAYS_THRESHOLD ? 10 : 0 }}>
          <Stat label="Paper observation" value={`${view.paper_observation_days_count} days`} />
          <Stat label="Realized P&L" value={formatUsd(view.cumulative_paper_pnl_realized ?? 0, { sign: true })} />
          <Stat label="Unrealized P&L" value={formatUsd(view.cumulative_paper_pnl_unrealized ?? 0, { sign: true })} />
        </div>
        {view.paper_observation_days_count < COLD_START_DAYS_THRESHOLD ? (
          <div style={{ fontSize: 11, color: "var(--vr-cream-mute, #8c8579)", lineHeight: 1.55 }}>
            <strong style={{ color: "var(--vr-gold, #c8a968)", fontWeight: 600 }}>Below 5-day threshold.</strong>{" "}
            Numbers above are early signal, not a track record. Live consideration requires a clean unassisted run.
          </div>
        ) : null}
      </div>

      {/* Mandate disclosure — closes the "starter strategy ≠ starter product" gap */}
      <SectionLabel>Strategy mandate</SectionLabel>
      <div
        style={{
          padding: 14,
          border: "1px solid var(--vr-gold, #c8a968)33",
          background: "rgba(200,169,104,0.04)",
          borderRadius: 3,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--vr-gold, #c8a968)",
            marginBottom: 8,
            fontWeight: 600,
          }}
        >
          {view.library_entry.mandate}
        </div>
        <p style={{ fontSize: 12, color: "var(--vr-cream-dim, #c4bdac)", lineHeight: 1.65, margin: 0 }}>
          {view.disclosure.mandate_disclosure_paragraph}
        </p>
      </div>

      {/* Backing strategy state */}
      {view.enrollment ? (
        <>
          <SectionLabel>Backing strategy</SectionLabel>
          <div
            style={{
              padding: 14,
              border: "1px solid var(--vr-line, #2a2438)",
              borderRadius: 3,
              background: "rgba(241,236,224,0.02)",
              fontSize: 11,
              color: "var(--vr-cream-dim, #c4bdac)",
              fontFamily: "var(--ff-mono)",
              lineHeight: 1.6,
            }}
          >
            <div>state · {view.enrollment.backing_strategy_state}</div>
            <div>record · {view.enrollment.backing_record_id}</div>
            <div>manifest · {view.enrollment.execution_manifest_id}</div>
            <div>params hash · {view.enrollment.strategy_parameters_hash}</div>
          </div>
        </>
      ) : null}

      <div
        style={{
          marginTop: 18,
          paddingTop: 14,
          borderTop: "1px solid var(--vr-line, #2a2438)",
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <a
          href="/vires/guided/preview/active"
          style={{
            padding: "10px 14px",
            border: "1px solid var(--vr-line, #2a2438)",
            color: "var(--vr-cream-dim, #c4bdac)",
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            textDecoration: "none",
            borderRadius: 2,
          }}
        >
          ← Back to enrollment
        </a>
        <a
          href="/vires/guided/preview/events"
          style={{
            padding: "10px 14px",
            border: "1px solid var(--vr-line, #2a2438)",
            color: "var(--vr-cream-dim, #c4bdac)",
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            textDecoration: "none",
            borderRadius: 2,
          }}
        >
          View event history →
        </a>
      </div>
    </GuidedHeroCard>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 9,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--vr-cream-mute, #8c8579)",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 14, color: "var(--vr-cream, #f1ece0)", fontFamily: "var(--ff-mono)" }}>{value}</div>
    </div>
  )
}

function labelForType(t: string): string {
  return (
    {
      BACKTEST: "Historical backtest",
      SHADOW_FORWARD_OBSERVED: "Shadow forward (signals only)",
      BENCH_MULTI_ERA: "Bench multi-era backtest",
      PAPER_FORWARD_SANDBOX: "Paper forward · sandbox",
      PAPER_FORWARD_PROMOTED: "Paper forward · this enrollment",
      LIVE_OBSERVED: "Live observation",
    }[t] ?? t
  )
}

function groupBy<T, K extends string>(arr: T[], key: (x: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>
  for (const item of arr) {
    const k = key(item)
    if (!out[k]) out[k] = []
    out[k].push(item)
  }
  return out
}
