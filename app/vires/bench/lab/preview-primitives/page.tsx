"use client"

// Preview page for Strategy Authoring primitive components. Not linked from
// nav — operators / dev navigate directly to /vires/bench/lab/preview-primitives
// to verify visual treatment. Renders each primitive with representative data.
//
// Will be removed (or moved behind a flag) once these components are wired
// into real screens post-PR-#3 merge.

import { useState } from "react"

import type {
  AssumptionItem,
  AuthoringProvenance,
  ProvenanceConfidence,
  ProvenanceSource,
  StrategyAuthoringRenderMode,
} from "@/lib/research-lab-contracts"

import { AssumptionCard } from "@/components/vires/lab/strategy-authoring/assumption-card"
import { ConfidenceBadge } from "@/components/vires/lab/strategy-authoring/confidence-badge"
import { ModePill } from "@/components/vires/lab/strategy-authoring/mode-pill"
import { ProvenanceChip } from "@/components/vires/lab/strategy-authoring/provenance-chip"

const ALL_SOURCES: ProvenanceSource[] = [
  "USER",
  "REFERENCE",
  "PAPER",
  "CATALOG",
  "MARKET_PACKET",
  "TUNABLE_DEFAULT",
  "TALON_INFERENCE",
]

const ALL_CONFIDENCES: ProvenanceConfidence[] = ["HIGH", "MEDIUM", "LOW"]

const SAMPLE_RATIONALE: Record<ProvenanceSource, string> = {
  USER: "You typed this directly during questionnaire Q3.",
  REFERENCE: "Lifted from RAM strategy spec (preset stop_5_target_15).",
  PAPER: "Sourced from Asness 2013 — momentum + value crossover paper.",
  CATALOG: "Pulled from data capability catalog: Alpaca daily OHLCV (2015-present).",
  MARKET_PACKET: "Today's market packet flagged sector rotation; benchmark adjusted.",
  TUNABLE_DEFAULT: "No reference available; default for momentum family in stocks sleeve.",
  TALON_INFERENCE: "Talon inferred from your edge family (momentum) and capital tier (medium).",
}

function provenance(source: ProvenanceSource, confidence: ProvenanceConfidence, confirmed = false): AuthoringProvenance {
  return {
    source,
    confidence,
    rationale: SAMPLE_RATIONALE[source],
    source_artifact_id:
      source === "REFERENCE"
        ? "strategy_specs/spec_01KQ_RAM_stop_5_target_15.yaml"
        : source === "PAPER"
          ? "papers/asness_2013_value_momentum_everywhere.pdf"
          : null,
    operator_confirmed: confirmed,
  }
}

const SAMPLE_ASSUMPTIONS: AssumptionItem[] = [
  {
    field_path: "strategy_spec.exit_rules.stop_loss_pct",
    assumption: "5% stop loss matches RAM's frozen winner. Talon kept it identical because regime (medium-vol) is similar.",
    provenance: provenance("REFERENCE", "HIGH"),
    risk_if_wrong: "MEDIUM",
    resolution_needed: false,
  },
  {
    field_path: "strategy_spec.universe.symbols",
    assumption: "Universe set to AAPL/MSFT/GOOGL/META/AMZN/NVDA — the same 6 megacaps RAM uses. May not generalize to your thesis if you're targeting smaller-cap momentum.",
    provenance: provenance("TALON_INFERENCE", "LOW"),
    risk_if_wrong: "HIGH",
    resolution_needed: true,
  },
  {
    field_path: "evidence_thresholds.paper.min_closed_trades",
    assumption: "Defaulted to 30 closed trades for paper validation. Standard for momentum at MEDIUM capital tier; overrides available in Expert mode.",
    provenance: provenance("TUNABLE_DEFAULT", "MEDIUM"),
    risk_if_wrong: "LOW",
    resolution_needed: false,
  },
]

export default function PreviewPrimitivesPage() {
  const [mode, setMode] = useState<StrategyAuthoringRenderMode>("INTERMEDIATE")
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set())
  const [deferredIds, setDeferredIds] = useState<Set<string>>(new Set())

  const handleConfirm = (item: AssumptionItem) =>
    setConfirmedIds(prev => new Set(prev).add(item.field_path))
  const handleDefer = (item: AssumptionItem) =>
    setDeferredIds(prev => new Set(prev).add(item.field_path))

  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "32px 20px 120px",
        display: "flex",
        flexDirection: "column",
        gap: 36,
      }}
    >
      <header style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="t-eyebrow" style={{ fontSize: 10, letterSpacing: "0.16em", color: "var(--vr-cream-mute)" }}>
          STRATEGY AUTHORING · PRIMITIVES PREVIEW
        </span>
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--ff-serif)",
            fontSize: 28,
            color: "var(--vr-cream)",
            lineHeight: 1.2,
          }}
        >
          Visual sanity check
        </h1>
        <p
          className="t-read"
          style={{ margin: 0, fontSize: 13, color: "var(--vr-cream-dim)", lineHeight: 1.5 }}
        >
          Renders the four primitives (ProvenanceChip, ConfidenceBadge, ModePill, AssumptionCard)
          with representative data. Not linked from nav. Will be removed or flag-gated once
          components are wired into real screens.
        </p>
      </header>

      <Section title="ModePill" subtitle="Profile-wide default + per-packet override. Tap pill to switch modes for this preview.">
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, alignItems: "center" }}>
          <span className="t-mono" style={{ fontSize: 11, color: "var(--vr-cream-faint)" }}>
            current: {mode}
          </span>
          <ModePill mode={mode} onChange={setMode} />
        </div>
      </Section>

      <Section title="ProvenanceChip" subtitle="One row per source, one column per confidence level. Tap any chip for full rationale.">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "120px repeat(3, 1fr)",
            gap: 12,
            alignItems: "center",
          }}
        >
          <span />
          {ALL_CONFIDENCES.map(c => (
            <span
              key={c}
              className="t-eyebrow"
              style={{ fontSize: 9, letterSpacing: "0.16em", color: "var(--vr-cream-faint)" }}
            >
              {c}
            </span>
          ))}
          {ALL_SOURCES.map(source => (
            <RowFragment key={source} source={source} />
          ))}
        </div>
      </Section>

      <Section title="ConfidenceBadge (alone)" subtitle="Standalone — usually paired with a chip but can render solo.">
        <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
          {ALL_CONFIDENCES.map(level => (
            <span key={level} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <ConfidenceBadge level={level} />
              <span className="t-mono" style={{ fontSize: 10, color: "var(--vr-cream-mute)" }}>
                {level}
              </span>
            </span>
          ))}
        </div>
      </Section>

      <Section title="Operator-confirmed indicator" subtitle="Provenance chip with operator_confirmed=true shows a green check.">
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <ProvenanceChip provenance={provenance("USER", "HIGH", false)} />
            <span className="t-mono" style={{ fontSize: 10, color: "var(--vr-cream-faint)" }}>
              awaiting
            </span>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <ProvenanceChip provenance={provenance("USER", "HIGH", true)} />
            <span className="t-mono" style={{ fontSize: 10, color: "var(--vr-cream-faint)" }}>
              confirmed
            </span>
          </span>
        </div>
      </Section>

      <Section
        title="AssumptionCard"
        subtitle="Three sample assumptions. resolution_needed:true items get gold border. Confirm/Edit/Mark for research are wired to local state for this preview."
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {SAMPLE_ASSUMPTIONS.map(item => {
            const confirmed = confirmedIds.has(item.field_path)
            const deferred = deferredIds.has(item.field_path)
            const liveItem: AssumptionItem = confirmed
              ? { ...item, provenance: { ...item.provenance, operator_confirmed: true } }
              : item
            return (
              <div key={item.field_path} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <AssumptionCard
                  item={liveItem}
                  onConfirm={handleConfirm}
                  onEdit={i => alert(`Would open edit for: ${i.field_path}`)}
                  onDefer={handleDefer}
                />
                {deferred && (
                  <span
                    className="t-mono"
                    style={{ fontSize: 10, color: "var(--vr-gold)", paddingLeft: 14 }}
                  >
                    · marked for research
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </Section>
    </main>
  )
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span
          className="t-eyebrow"
          style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--vr-gold)" }}
        >
          {title}
        </span>
        <span
          className="t-read"
          style={{ fontSize: 12, color: "var(--vr-cream-dim)", lineHeight: 1.5 }}
        >
          {subtitle}
        </span>
      </div>
      {children}
    </section>
  )
}

function RowFragment({ source }: { source: ProvenanceSource }) {
  return (
    <>
      <span
        className="t-mono"
        style={{ fontSize: 10.5, color: "var(--vr-cream-mute)", letterSpacing: "0.04em" }}
      >
        {source}
      </span>
      {ALL_CONFIDENCES.map(confidence => (
        <ProvenanceChip
          key={confidence}
          provenance={provenance(source, confidence)}
        />
      ))}
    </>
  )
}
