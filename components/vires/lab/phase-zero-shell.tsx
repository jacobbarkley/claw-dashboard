"use client"

import Link from "next/link"
import type { ReactNode } from "react"

// Shared scaffold for every /vires/lab/* page during Phase 0.
//
// The Research Lab ships in phases (see SPEC_REVIEW_2026-04-23.md §4):
//
//   Phase 0 — contracts + registry audit (Codex)        — IN PROGRESS
//   Phase 1a — stocks-only E2E submit-run-promote loop  — NOT STARTED
//   Phase 1b — crypto + options preset YAMLs            — NOT STARTED
//   Phase 1c — cancel surface                           — NOT STARTED
//   Phase 2+ — idea bank, nightly autopilot, AI triage  — NOT STARTED
//
// Every route rendered with this shell is honest about where we are. No
// invented data, no fake chrome, no placeholder numbers styled to look
// like live telemetry. When contracts land, real components replace the
// body; the shell itself retires.

export function LabPhaseZeroShell({
  eyebrow,
  title,
  pitch,
  subsection,
  children,
}: {
  eyebrow: string
  title: string
  pitch: string
  subsection?: string
  children?: ReactNode
}) {
  return (
    <div style={{ padding: "28px 20px 120px", maxWidth: 880, margin: "0 auto" }}>
      {/* Hero */}
      <div className="vr-card-hero" style={{ padding: "24px 22px 22px" }}>
        <div
          className="t-eyebrow"
          style={{ fontSize: 10, color: "var(--vr-gold)", marginBottom: 10, letterSpacing: "0.14em" }}
        >
          {eyebrow}
        </div>
        <h1
          className="t-display"
          style={{
            margin: 0,
            fontSize: 28,
            lineHeight: 1.15,
            color: "var(--vr-cream)",
            fontWeight: 400,
          }}
        >
          {title}
        </h1>
        {subsection ? (
          <div
            className="t-mono"
            style={{
              marginTop: 6,
              fontSize: 11,
              color: "var(--vr-cream-mute)",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            {subsection}
          </div>
        ) : null}
        <p
          style={{
            margin: "14px 0 0",
            fontSize: 13.5,
            lineHeight: 1.55,
            color: "var(--vr-cream-mute)",
            maxWidth: 640,
          }}
        >
          {pitch}
        </p>
      </div>

      {/* Phase 0 honest-empty banner */}
      <div
        className="vr-card"
        style={{
          marginTop: 14,
          padding: "16px 18px",
          borderLeft: "2px solid var(--vr-gold)",
          background: "rgba(241,236,224,0.02)",
        }}
      >
        <div
          className="t-eyebrow"
          style={{
            fontSize: 9,
            color: "var(--vr-gold)",
            marginBottom: 6,
            letterSpacing: "0.14em",
          }}
        >
          Phase 0 · awaiting backend contracts
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--vr-cream)" }}>
          The UI shell is scaffolded. Real data lights up once Codex's
          Phase 0 contracts + worker land on the trading-bot side. Nothing
          here invents backend truth — when you see a number or a state
          chip on this page, it came from a real artifact.
        </div>
        <div
          style={{
            marginTop: 10,
            fontSize: 11.5,
            color: "var(--vr-cream-mute)",
            lineHeight: 1.55,
          }}
        >
          Spec:{" "}
          <Link
            href="https://github.com/jacobbarkley/claw-dashboard/blob/main/_design_handoff/_reference/research_lab/SPEC_REVIEW_2026-04-23.md"
            style={{ color: "var(--vr-gold)", textDecoration: "none" }}
          >
            SPEC_REVIEW_2026-04-23.md
          </Link>
          {" · "}Scope: <span className="t-mono">jacob / paper_main / default</span>
        </div>
      </div>

      {children}
    </div>
  )
}

// A dashed "this will live here" card slot. Use for surfaces that have a
// clear shape (ideas list, job status, etc.) but no real data yet.
export function LabPhaseZeroSlot({
  label,
  note,
}: {
  label: string
  note: string
}) {
  return (
    <div
      style={{
        marginTop: 14,
        padding: "20px 18px",
        border: "1px dashed rgba(241,236,224,0.14)",
        borderRadius: 3,
        background: "rgba(10,11,20,0.35)",
      }}
    >
      <div
        className="t-eyebrow"
        style={{ fontSize: 9, color: "var(--vr-cream-mute)", marginBottom: 6, letterSpacing: "0.14em" }}
      >
        {label}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--vr-cream-mute)", lineHeight: 1.55 }}>{note}</div>
    </div>
  )
}
