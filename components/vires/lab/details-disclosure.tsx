"use client"

// Collapsed-by-default details container. Wraps the full candidate
// scorecard (and anything else operator-detail) so the job page leads
// with the truth panel + atlas + verdict, not a wall of gates.

import { useState, type ReactNode } from "react"

interface DetailsDisclosureProps {
  label?: string
  hint?: string
  children: ReactNode
}

export function DetailsDisclosure({
  label = "Details",
  hint,
  children,
}: DetailsDisclosureProps) {
  const [open, setOpen] = useState(false)

  return (
    <section
      className="vr-card"
      style={{
        padding: open ? "14px 18px 18px" : "12px 18px",
        display: "flex",
        flexDirection: "column",
        gap: open ? 14 : 0,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          color: "inherit",
          textAlign: "left",
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          fontFamily: "inherit",
        }}
      >
        <span style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span
            className="t-eyebrow"
            style={{
              fontSize: 9,
              color: "var(--vr-gold)",
              letterSpacing: "0.14em",
            }}
          >
            {label}
          </span>
          {hint && (
            <span
              style={{
                fontFamily: "var(--ff-serif)",
                fontStyle: "italic",
                fontSize: 13,
                color: "var(--vr-cream-mute)",
              }}
            >
              {hint}
            </span>
          )}
        </span>
        <span
          aria-hidden
          style={{
            fontSize: 11,
            color: "var(--vr-cream-mute)",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 120ms ease",
            display: "inline-block",
          }}
        >
          ▸
        </span>
      </button>
      {open && <div>{children}</div>}
    </section>
  )
}
