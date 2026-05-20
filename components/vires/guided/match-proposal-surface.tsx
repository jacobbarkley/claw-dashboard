"use client"

import { useState } from "react"
import type {
  DisclosureVersion,
  GuidedMatchProposal,
  GuidedMatchProposalView,
  StrategyLibraryEntry,
} from "./types"
import { EvidenceCard, FieldEyebrow, GuidedHeroCard, SectionLabel } from "./shared"
import { DeclineMatchSurface } from "./decline-match-surface"

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
  const [view, setView] = useState<"match" | "declining">("match")
  const [maybeLaterState, setMaybeLaterState] = useState<
    | { stage: "idle" }
    | { stage: "submitting" }
    | { stage: "submitted"; warning: string | null }
    | { stage: "error"; reason: string }
  >({ stage: "idle" })
  const [acceptState, setAcceptState] = useState<
    | { stage: "idle" }
    | { stage: "submitting" }
    | { stage: "submitted"; warning: string | null }
    | { stage: "error"; reason: string }
  >({ stage: "idle" })

  const winner = proposal.considered_candidates.find(
    c =>
      c.decision === "SELECTED" &&
      c.library_entry_id === proposal.matched_library_entry_id &&
      c.library_entry_version === proposal.matched_library_entry_version,
  )
  const rejected = proposal.considered_candidates.filter(c => c.decision === "REJECTED")
  const hasAlternatives = rejected.length > 0

  if (view === "declining") {
    return (
      <DeclineMatchSurface
        proposalId={proposal.proposal_id}
        hasAlternatives={hasAlternatives}
        onCancel={() => setView("match")}
      />
    )
  }

  async function submitAcceptMatch() {
    setAcceptState({ stage: "submitting" })
    try {
      const res = await fetch("/api/guided/accept-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposal_id: proposal.proposal_id,
          matched_library_entry_id: proposal.matched_library_entry_id,
          matched_library_entry_version: proposal.matched_library_entry_version,
        }),
      })
      const json = (await res.json()) as { ok?: boolean; next_path?: string; error?: string }
      if (res.status === 503) {
        setAcceptState({
          stage: "submitted",
          warning: "Match acceptance recorded locally; runtime not yet wired in this environment.",
        })
        if (json.next_path) {
          window.setTimeout(() => window.location.assign(json.next_path as string), 800)
        }
        return
      }
      if (!res.ok || !json.ok) {
        setAcceptState({ stage: "error", reason: json.error ?? `HTTP ${res.status}` })
        return
      }
      setAcceptState({ stage: "submitted", warning: null })
      if (json.next_path) window.location.assign(json.next_path)
    } catch (err) {
      setAcceptState({ stage: "error", reason: (err as Error).message ?? "network_error" })
    }
  }

  async function submitMaybeLater() {
    setMaybeLaterState({ stage: "submitting" })
    try {
      const res = await fetch("/api/guided/save-questionnaire-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "maybe_later_from_match" }),
      })
      const json = (await res.json()) as { ok?: boolean; next_path?: string; error?: string }
      if (res.status === 503) {
        setMaybeLaterState({
          stage: "submitted",
          warning: "Saved locally; backend not yet live in this environment.",
        })
        if (json.next_path) {
          window.setTimeout(() => window.location.assign(json.next_path as string), 600)
        }
        return
      }
      if (!res.ok || !json.ok) {
        setMaybeLaterState({
          stage: "error",
          reason: json.error ?? `HTTP ${res.status}`,
        })
        return
      }
      setMaybeLaterState({ stage: "submitted", warning: null })
      if (json.next_path) window.location.assign(json.next_path)
    } catch (err) {
      setMaybeLaterState({
        stage: "error",
        reason: (err as Error).message ?? "network_error",
      })
    }
  }

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

      {proposal.mismatched_answer_keys.length > 0 ? (
        <>
          <SectionLabel>What to know</SectionLabel>
          <div
            style={{
              padding: 12,
              border: "1px dashed var(--vr-gold, #c8a968)66",
              borderRadius: 3,
              background: "rgba(200,169,104,0.04)",
              marginBottom: 18,
              fontSize: 12,
              color: "var(--vr-cream-dim, #c4bdac)",
              lineHeight: 1.6,
            }}
          >
            This is a partial fit. Your answer on{" "}
            <strong style={{ color: "var(--vr-gold, #c8a968)", fontWeight: 600 }}>
              {proposal.mismatched_answer_keys.map(humanizeAnswerKey).join(", ")}
            </strong>{" "}
            does not fully match this strategy. You can continue in paper mode, but treat that mismatch as part of the risk.
          </div>
        </>
      ) : null}

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
            match quality: {(proposal.match_quality_score * 100).toFixed(0)}%
            {"\n"}
            matched answers: {proposal.matched_answer_keys.map(humanizeAnswerKey).join(", ") || "none"}
            {"\n"}
            mismatched answers: {proposal.mismatched_answer_keys.map(humanizeAnswerKey).join(", ") || "none"}
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

      <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap", marginTop: 18 }}>
        <button
          type="button"
          onClick={() => setView("declining")}
          disabled={maybeLaterState.stage === "submitting"}
          style={btnSecondary}
        >
          Decline
        </button>
        <button
          type="button"
          onClick={submitMaybeLater}
          disabled={maybeLaterState.stage === "submitting" || maybeLaterState.stage === "submitted"}
          style={btnSecondary}
        >
          {maybeLaterState.stage === "submitting"
            ? "Saving…"
            : maybeLaterState.stage === "submitted"
              ? "Saved"
              : "Maybe later"}
        </button>
        <button
          type="button"
          onClick={submitAcceptMatch}
          disabled={acceptState.stage === "submitting" || acceptState.stage === "submitted"}
          style={{
            ...btnPrimary,
            opacity: acceptState.stage === "submitting" || acceptState.stage === "submitted" ? 0.7 : 1,
            cursor:
              acceptState.stage === "submitting" || acceptState.stage === "submitted"
                ? "not-allowed"
                : "pointer",
          }}
        >
          {acceptState.stage === "submitting"
            ? "Accepting…"
            : acceptState.stage === "submitted"
              ? "Accepted"
              : "Continue →"}
        </button>
      </div>
      {acceptState.stage === "submitted" && acceptState.warning ? (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            border: "1px dashed var(--vr-gold, #c8a968)55",
            background: "rgba(200,169,104,0.05)",
            color: "var(--vr-cream-dim, #c4bdac)",
            fontSize: 12,
            borderRadius: 2,
            lineHeight: 1.5,
          }}
        >
          {acceptState.warning}
        </div>
      ) : null}
      {acceptState.stage === "error" ? (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            border: "1px solid #c8686855",
            background: "rgba(200,104,104,0.06)",
            color: "#e6a8a8",
            fontSize: 12,
            borderRadius: 2,
            lineHeight: 1.5,
          }}
        >
          Could not accept the match ({acceptState.reason}). Try again or choose Decline.
        </div>
      ) : null}
      {maybeLaterState.stage === "submitted" && maybeLaterState.warning ? (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            border: "1px dashed var(--vr-gold, #c8a968)55",
            background: "rgba(200,169,104,0.05)",
            color: "var(--vr-cream-dim, #c4bdac)",
            fontSize: 12,
            borderRadius: 2,
            lineHeight: 1.5,
          }}
        >
          {maybeLaterState.warning}
        </div>
      ) : null}
      {maybeLaterState.stage === "error" ? (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            border: "1px solid #c8686855",
            background: "rgba(200,104,104,0.06)",
            color: "#e6a8a8",
            fontSize: 12,
            borderRadius: 2,
            lineHeight: 1.5,
          }}
        >
          Could not save ({maybeLaterState.reason}). Try again or choose Decline to share more.
        </div>
      ) : null}
    </GuidedHeroCard>
  )
}

// Phase 6 swap path. The page server component reads the composed
// `guided_match_proposal_view.v1` artifact via
// `readGuidedMatchProposalView()` in lib/guided-data-source.server.ts and
// hands the view to this wrapper instead of fetching three artifacts.
// The visual component is unchanged.
export function MatchProposalSurfaceFromView({ view }: { view: GuidedMatchProposalView }) {
  return (
    <MatchProposalSurface
      proposal={view.proposal}
      libraryEntry={view.library_entry}
      disclosure={view.disclosure}
    />
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

function humanizeAnswerKey(key: string): string {
  const map: Record<string, string> = {
    risk_profile: "risk profile",
    drawdown_tolerance: "drawdown tolerance",
    asset_class_preference: "asset class",
    time_horizon: "time horizon",
  }
  return map[key] ?? key.replace(/_/g, " ")
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
  textDecoration: "none",
  display: "inline-block",
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
  textDecoration: "none",
  display: "inline-block",
  borderRadius: 2,
}
