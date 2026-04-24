"use client"

import type { ReactNode } from "react"

// Shared hero scaffold for /vires/lab/* pages. Copy should read as the
// product itself, not as a meta-description of the build phase. Honest
// empty states happen via LabPhaseZeroSlot (below), never as screen-wide
// "awaiting backend" banners.

export function LabPhaseZeroShell({
  eyebrow,
  title,
  pitch,
  subsection,
  children,
}: {
  eyebrow: string
  title: string
  pitch?: string
  subsection?: string
  children?: ReactNode
}) {
  return (
    <div style={{ padding: "28px 20px 120px", maxWidth: 880, margin: "0 auto" }}>
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
        {pitch ? (
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
        ) : null}
      </div>

      {children}
    </div>
  )
}

// Dashed "this will live here" card slot for real-but-not-yet-populated
// surfaces. Use sparingly — empty placeholders add up fast.
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
