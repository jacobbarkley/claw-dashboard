"use client"

import { useState } from "react"
import type { DisclosureVersion, StrategyLibraryEntry } from "./types"
import { EvidenceCard, FieldEyebrow, GuidedHeroCard, SectionLabel } from "./shared"

// S4 — Disclosure acceptance. Mobile-first, scannable in ~30 seconds.
// Drawdown headline + paper/live distinction + what_you_accept_bullets +
// not_guaranteed_copy + 5-axis evidence_summary + required_attestation_text.
// Accept disabled until checkbox is checked.

export function DisclosureSurface({
  disclosure,
  libraryEntry,
}: {
  disclosure: DisclosureVersion
  libraryEntry: StrategyLibraryEntry
}) {
  const [attested, setAttested] = useState(false)
  const [showFull, setShowFull] = useState(false)

  return (
    <GuidedHeroCard>
      <FieldEyebrow>Read before accepting</FieldEyebrow>
      <h1
        style={{
          fontSize: 24,
          fontFamily: "var(--ff-serif)",
          fontStyle: "italic",
          color: "var(--vr-cream, #f1ece0)",
          fontWeight: 400,
          marginTop: 6,
          marginBottom: 8,
        }}
      >
        Start paper trading with {libraryEntry.friendly_name}?
      </h1>
      <p
        style={{
          fontSize: 11,
          color: "var(--vr-cream-mute, #8c8579)",
          lineHeight: 1.55,
          marginTop: 0,
          marginBottom: 18,
        }}
      >
        Accepting captures your consent and starts broker setup. Paper trading begins only after broker checks pass.
      </p>

      {/* The drawdown headline — big, framed as worst case */}
      <Block>
        <FieldEyebrow>The worst we&apos;ve seen</FieldEyebrow>
        <div
          style={{
            fontSize: 44,
            fontFamily: "var(--ff-mono)",
            color: "var(--vr-cream, #f1ece0)",
            marginTop: 6,
            marginBottom: 4,
          }}
        >
          −{disclosure.drawdown_headline_pct.toFixed(1)}%
        </div>
        <div style={{ fontSize: 12, color: "var(--vr-cream-mute, #8c8579)" }}>{disclosure.drawdown_headline_period_label}</div>
        <div style={{ fontSize: 11, color: "var(--vr-cream-mute, #8c8579)", marginTop: 8, lineHeight: 1.5 }}>
          {disclosure.drawdown_headline}
        </div>
      </Block>

      {/* Paper/live distinction — unmissable */}
      <Block accentColor="#c8a968">
        <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
          <span style={{ fontSize: 18 }}>⚠</span>
          <div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--vr-gold, #c8a968)",
                marginBottom: 4,
              }}
            >
              This is paper trading
            </div>
            <div style={{ fontSize: 12, color: "var(--vr-cream-dim, #c4bdac)", lineHeight: 1.55 }}>
              {disclosure.paper_live_distinction}
            </div>
          </div>
        </div>
      </Block>

      {/* What you're accepting — structured bullets */}
      <SectionLabel>What you&apos;re accepting</SectionLabel>
      <ul style={{ paddingLeft: 20, color: "var(--vr-cream-dim, #c4bdac)", fontSize: 13, lineHeight: 1.7, margin: 0, marginBottom: 18 }}>
        {disclosure.what_you_accept_bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>

      {/* Mandate disclosure — TACTICAL_PARTIAL surface */}
      <SectionLabel>Strategy mandate</SectionLabel>
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--vr-gold, #c8a968)",
          marginBottom: 6,
        }}
      >
        {libraryEntry.mandate}
      </div>
      <p style={{ fontSize: 12, color: "var(--vr-cream-dim, #c4bdac)", lineHeight: 1.65, margin: 0, marginBottom: 18 }}>
        {disclosure.mandate_disclosure_paragraph}
      </p>

      {/* What we don't promise */}
      <SectionLabel>What we don&apos;t promise</SectionLabel>
      <p style={{ fontSize: 12, color: "var(--vr-cream-dim, #c4bdac)", lineHeight: 1.65, margin: 0, marginBottom: 18 }}>
        {disclosure.not_guaranteed_copy}
      </p>

      {/* Evidence — 5 dimensions, never collapsed */}
      <SectionLabel>The evidence</SectionLabel>
      <div style={{ marginBottom: 18 }}>
        {disclosure.evidence_summary.map(e => (
          <EvidenceCard key={e.evidence_id} evidence={e} compact />
        ))}
      </div>

      {/* Show full disclosures expansion */}
      <button
        type="button"
        onClick={() => setShowFull(!showFull)}
        style={{
          background: "transparent",
          border: "none",
          color: "var(--vr-gold, #c8a968)",
          fontSize: 11,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          cursor: "pointer",
          padding: 0,
          marginBottom: 18,
        }}
      >
        {showFull ? "▾ Hide full disclosures" : "▸ Show full disclosures"}
      </button>
      {showFull ? (
        <div style={{ marginBottom: 18 }}>
          {disclosure.technical_details.map(s => (
            <div
              key={s.section_id}
              style={{
                marginBottom: 12,
                paddingTop: 12,
                borderTop: "1px solid var(--vr-line, #2a2438)",
              }}
            >
              <FieldEyebrow>{s.title}</FieldEyebrow>
              <p style={{ fontSize: 11, color: "var(--vr-cream-dim, #c4bdac)", lineHeight: 1.55, margin: 0 }}>{s.body}</p>
            </div>
          ))}
        </div>
      ) : null}

      {/* Attestation checkbox — exact wording from contract */}
      <label
        style={{
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
          padding: 12,
          border: "1px solid var(--vr-line, #2a2438)",
          borderRadius: 3,
          marginBottom: 16,
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={attested}
          onChange={e => setAttested(e.target.checked)}
          style={{ marginTop: 3, accentColor: "#c8a968" }}
        />
        <span style={{ fontSize: 12, color: "var(--vr-cream-dim, #c4bdac)", lineHeight: 1.55 }}>
          {disclosure.required_attestation_text}
        </span>
      </label>

      <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
        <a href="/vires/guided/preview/match" style={btnSecondary}>
          Cancel
        </a>
        {attested ? (
          <a
            href="/vires/guided/preview/broker"
            style={{
              ...btnPrimary,
              background: "var(--vr-gold, #c8a968)",
              color: "var(--vr-bg, #0c0a17)",
            }}
          >
            Accept →
          </a>
        ) : (
          <button
            type="button"
            disabled
            style={{
              ...btnPrimary,
              background: "rgba(200,169,104,0.18)",
              color: "var(--vr-cream-mute, #8c8579)",
              cursor: "not-allowed",
            }}
          >
            Accept →
          </button>
        )}
      </div>

      <div style={{ marginTop: 16, fontSize: 10, color: "var(--vr-cream-mute, #8c8579)", fontFamily: "var(--ff-mono)" }}>
        disclosure_version: {disclosure.disclosure_version_id} · classification: {disclosure.change_classification}
      </div>
      <div style={{ marginTop: 8, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--vr-cream-mute, #8c8579)" }}>
        Preview only · clicks navigate between surfaces, no commands run
      </div>
    </GuidedHeroCard>
  )
}

function Block({ children, accentColor }: { children: React.ReactNode; accentColor?: string }) {
  return (
    <div
      style={{
        padding: "14px 14px",
        border: `1px solid ${accentColor ? `${accentColor}33` : "var(--vr-line, #2a2438)"}`,
        background: accentColor ? `${accentColor}0d` : "rgba(241,236,224,0.02)",
        borderRadius: 3,
        marginBottom: 16,
      }}
    >
      {children}
    </div>
  )
}

const btnPrimary = {
  padding: "12px 18px",
  background: "var(--vr-gold, #c8a968)",
  border: "1px solid var(--vr-gold, #c8a968)",
  color: "var(--vr-bg, #0c0a17)",
  fontSize: 11,
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  fontWeight: 600,
  borderRadius: 2,
  textDecoration: "none",
  display: "inline-block",
}

const btnSecondary = {
  padding: "12px 14px",
  background: "transparent",
  border: "1px solid var(--vr-line, #2a2438)",
  color: "var(--vr-cream-dim, #c4bdac)",
  fontSize: 11,
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  cursor: "pointer",
  borderRadius: 2,
  textDecoration: "none",
  display: "inline-block",
}
