"use client"

import { useState } from "react"
import type { DisclosureVersion, GuidedMatchProposal, StrategyLibraryEntry } from "./types"
import { EvidenceCard, FieldEyebrow, GuidedHeroCard, SectionLabel } from "./shared"

// S3 — Match proposal preview. Shows the friendly_name, mandate_subtitle,
// drawdown headline, plain_english_thesis, asset_class_label,
// holding_period_typical_label, trade_frequency_typical_label, and the
// matched_tags rationale bullets. Technical-details expansion shows the
// candidates_considered with rejection_reason_label, plus matcher version,
// questionnaire version, evidence dimensions.
//
// FRICTION (Stage 2 → Audit 0.5): the structured drawdown headline lives
// on `disclosure_version` (drawdown_headline_pct + drawdown_headline_period_label),
// not on the library entry (which only carries the freeform display string).
// Match preview wants the big-number rendering, so this component reads
// from disclosure. Worth confirming: should UX always source the headline
// from disclosure_version, or should library_entry also carry the structured
// fields? Captured in STAGE2_FRICTION.

export function MatchProposalSurface({
  proposal,
  libraryEntry,
  disclosure,
}: {
  proposal: GuidedMatchProposal
  libraryEntry: StrategyLibraryEntry
  disclosure: DisclosureVersion
}) {
  const [expanded, setExpanded] = useState(false)

  const winner = proposal.considered_candidates.find(
    c =>
      c.decision === "SELECTED" &&
      c.library_entry_id === proposal.matched_library_entry_id &&
      c.library_entry_version === proposal.matched_library_entry_version,
  )
  const rejected = proposal.considered_candidates.filter(c => c.decision === "REJECTED")

  return (
    <GuidedHeroCard>
      {/* Header — friendly_name + mandate_subtitle */}
      <h1
        style={{
          fontSize: 28,
          fontFamily: "var(--ff-serif)",
          fontStyle: "italic",
          color: "var(--vr-cream, #f1ece0)",
          fontWeight: 400,
          marginTop: 0,
          marginBottom: 4,
          lineHeight: 1.15,
        }}
      >
        {libraryEntry.friendly_name}
      </h1>
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--vr-gold, #c8a968)",
          fontWeight: 500,
          marginBottom: 18,
        }}
      >
        {libraryEntry.mandate_subtitle}
      </div>

      {/* Drawdown headline — read structured fields from disclosure_version
          for the big-number rendering. library_entry.drawdown_headline is
          a display string used elsewhere (e.g. summary cards). */}
      <div
        style={{
          padding: "16px 14px",
          border: "1px solid var(--vr-line, #2a2438)",
          background: "rgba(241,236,224,0.02)",
          borderRadius: 3,
          marginBottom: 16,
        }}
      >
        <FieldEyebrow>Worst case we&apos;ve seen</FieldEyebrow>
        <div
          style={{
            fontSize: 40,
            fontFamily: "var(--ff-mono)",
            color: "var(--vr-cream, #f1ece0)",
            marginTop: 6,
            marginBottom: 2,
          }}
        >
          −{disclosure.drawdown_headline_pct.toFixed(1)}%
        </div>
        <div style={{ fontSize: 12, color: "var(--vr-cream-mute, #8c8579)" }}>
          {disclosure.drawdown_headline_period_label}
        </div>
        <div style={{ fontSize: 11, color: "var(--vr-cream-mute, #8c8579)", lineHeight: 1.5, marginTop: 8 }}>
          This is the deepest drop the strategy has experienced in our testing. It could be worse.
        </div>
      </div>

      <SectionLabel>How it works</SectionLabel>
      <p style={{ fontSize: 13, color: "var(--vr-cream-dim, #c4bdac)", lineHeight: 1.65, margin: 0, marginBottom: 14 }}>
        {libraryEntry.plain_english_thesis}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
        <FactRow label="Asset class" value={libraryEntry.asset_class_label} />
        <FactRow label="Hold time" value={libraryEntry.holding_period_typical_label} />
        <FactRow label="Trade rate" value={libraryEntry.trade_frequency_typical_label} />
      </div>

      <SectionLabel>Why this fits you</SectionLabel>
      <ul style={{ paddingLeft: 20, color: "var(--vr-cream-dim, #c4bdac)", fontSize: 13, lineHeight: 1.7, margin: 0, marginBottom: 18 }}>
        {(winner?.matched_tags ?? []).map(tag => (
          <li key={tag}>{humanizeTag(tag)}</li>
        ))}
      </ul>

      {/* Technical details expansion */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          background: "transparent",
          border: "none",
          color: "var(--vr-gold, #c8a968)",
          fontSize: 11,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          cursor: "pointer",
          padding: 0,
          marginBottom: expanded ? 14 : 0,
        }}
      >
        {expanded ? "▾ Hide technical details" : "▸ Show technical details"}
      </button>

      {expanded ? (
        <div
          style={{
            padding: 14,
            border: "1px solid var(--vr-line, #2a2438)",
            borderRadius: 3,
            background: "rgba(241,236,224,0.02)",
            marginBottom: 18,
          }}
        >
          <FieldEyebrow>Backing strategy</FieldEyebrow>
          <pre
            style={{
              fontSize: 10,
              fontFamily: "var(--ff-mono)",
              color: "var(--vr-cream-dim, #c4bdac)",
              margin: 0,
              marginBottom: 12,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {libraryEntry.backing_strategy.backing_record_id}
            {"\n"}
            manifest: {libraryEntry.backing_strategy.execution_manifest_id}
            {"\n"}
            matcher: {proposal.matcher_version} · questionnaire: {proposal.questionnaire_version}
            {"\n"}
            library entry: {libraryEntry.library_entry_id} v{libraryEntry.library_entry_version}
          </pre>

          <SectionLabel>Evidence shown</SectionLabel>
          {libraryEntry.evidence.map(e => (
            <EvidenceCard key={e.evidence_id} evidence={e} compact />
          ))}

          {rejected.length > 0 ? (
            <>
              <SectionLabel>Other strategies considered</SectionLabel>
              <ul style={{ paddingLeft: 20, color: "var(--vr-cream-dim, #c4bdac)", fontSize: 12, lineHeight: 1.6, margin: 0 }}>
                {rejected.map(c => (
                  <li key={c.library_entry_id}>
                    <strong style={{ color: "var(--vr-cream, #f1ece0)" }}>{c.library_entry_id}</strong>
                    {" — "}
                    {c.rejection_reason_label ?? c.rationale}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 18 }}>
        <button type="button" style={btnSecondary}>
          Decline
        </button>
        <button type="button" style={btnSecondary}>
          Maybe later
        </button>
        <button type="button" style={btnPrimary}>
          Continue →
        </button>
      </div>
    </GuidedHeroCard>
  )
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
      <span style={{ color: "var(--vr-cream-mute, #8c8579)", textTransform: "uppercase", letterSpacing: "0.12em", fontSize: 10 }}>{label}</span>
      <span style={{ color: "var(--vr-cream-dim, #c4bdac)", fontFamily: "var(--ff-mono)" }}>{value}</span>
    </div>
  )
}

function humanizeTag(tag: string): string {
  const map: Record<string, string> = {
    conservative_drawdown: "Conservative drawdown tolerance",
    us_equities: "US equities preference",
    multi_week_horizon: "Multi-week holding horizon",
    momentum: "Momentum preference",
    multi_month_horizon: "Multi-month horizon",
    long_horizon: "Long horizon",
    lump_sum: "Lump-sum funding",
    recurring_contribution: "Recurring contributions",
  }
  return map[tag] ?? tag.replace(/_/g, " ")
}

const btnPrimary = {
  padding: "10px 18px",
  background: "var(--vr-gold, #c8a968)",
  border: "1px solid var(--vr-gold, #c8a968)",
  color: "var(--vr-bg, #0c0a17)",
  fontSize: 11,
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  fontWeight: 600,
  cursor: "pointer",
  borderRadius: 2,
}

const btnSecondary = {
  padding: "10px 14px",
  background: "transparent",
  border: "1px solid var(--vr-line, #2a2438)",
  color: "var(--vr-cream-dim, #c4bdac)",
  fontSize: 11,
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  cursor: "pointer",
  borderRadius: 2,
}
