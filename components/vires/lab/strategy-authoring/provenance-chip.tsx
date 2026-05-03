"use client"

// ProvenanceChip — compact inline indicator showing the source of a Talon-
// generated or Talon-inferred field. Sits next to a field value. Tap to
// reveal full rationale + source artifact link + operator-confirmed status.
//
// Built against AuthoringProvenance from lib/research-lab-contracts.ts (PR #3).
//
// Design intent (per STRATEGY_AUTHORING_UX_PLAN_v1):
// - Always visible next to the field it describes
// - Single-letter abbreviation in mono uppercase, like a mini eyebrow
// - Color hue per source family (USER/REFERENCE highest authority,
//   TUNABLE_DEFAULT lowest, TALON_INFERENCE distinctive gold)
// - Optional ConfidenceBadge sibling shown to the right
// - Tap (or click) → popover with full provenance details

import { useEffect, useRef, useState } from "react"

import type { AuthoringProvenance, ProvenanceSource } from "@/lib/research-lab-contracts"

import { ConfidenceBadge } from "./confidence-badge"

const SOURCE_LABEL: Record<ProvenanceSource, string> = {
  USER: "you",
  REFERENCE: "reference",
  PAPER: "paper",
  CATALOG: "catalog",
  MARKET_PACKET: "market packet",
  TUNABLE_DEFAULT: "default",
  TALON_INFERENCE: "Talon",
}

const SOURCE_LETTER: Record<ProvenanceSource, string> = {
  USER: "U",
  REFERENCE: "R",
  PAPER: "P",
  CATALOG: "C",
  MARKET_PACKET: "M",
  TUNABLE_DEFAULT: "D",
  TALON_INFERENCE: "T",
}

const SOURCE_COLOR: Record<ProvenanceSource, string> = {
  USER: "var(--vr-cream)",
  REFERENCE: "var(--vr-cream)",
  PAPER: "var(--vr-cream-mute)",
  CATALOG: "var(--vr-cream-mute)",
  MARKET_PACKET: "var(--vr-cream-mute)",
  TUNABLE_DEFAULT: "var(--vr-cream-faint)",
  TALON_INFERENCE: "var(--vr-gold)",
}

interface ProvenanceChipProps {
  provenance: AuthoringProvenance
  showConfidence?: boolean
}

export function ProvenanceChip({ provenance, showConfidence = true }: ProvenanceChipProps) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLSpanElement>(null)
  const color = SOURCE_COLOR[provenance.source]

  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent | TouchEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    document.addEventListener("touchstart", handler)
    return () => {
      document.removeEventListener("mousedown", handler)
      document.removeEventListener("touchstart", handler)
    }
  }, [open])

  return (
    <span ref={wrapperRef} style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 4 }}>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        aria-label={`Source: ${SOURCE_LABEL[provenance.source]}`}
        className="t-eyebrow"
        style={{
          fontSize: 8.5,
          letterSpacing: "0.14em",
          color,
          border: `1px solid ${color}`,
          background: "transparent",
          padding: "1px 5px",
          borderRadius: 2,
          cursor: "pointer",
          fontFamily: "var(--ff-mono)",
          lineHeight: 1.2,
        }}
      >
        {SOURCE_LETTER[provenance.source]}
      </button>
      {showConfidence && <ConfidenceBadge level={provenance.confidence} />}
      {provenance.operator_confirmed && (
        <span
          aria-label="Operator confirmed"
          title="Operator confirmed"
          style={{
            fontSize: 9,
            color: "var(--vr-up)",
            lineHeight: 1,
          }}
        >
          ✓
        </span>
      )}
      {open && (
        <span
          role="dialog"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 30,
            minWidth: 220,
            maxWidth: 320,
            padding: "10px 12px",
            border: `1px solid ${color}`,
            background: "var(--vr-ink)",
            borderRadius: 3,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            boxShadow: "0 6px 24px rgba(0,0,0,0.55)",
          }}
        >
          <span
            className="t-eyebrow"
            style={{
              fontSize: 9,
              letterSpacing: "0.14em",
              color,
              textTransform: "uppercase",
            }}
          >
            Source · {SOURCE_LABEL[provenance.source]}
          </span>
          <span
            className="t-read"
            style={{
              fontSize: 11.5,
              color: "var(--vr-cream-dim)",
              lineHeight: 1.5,
            }}
          >
            {provenance.rationale || "No rationale recorded."}
          </span>
          {provenance.source_artifact_id && (
            <span
              className="t-mono"
              style={{
                fontSize: 10,
                color: "var(--vr-cream-faint)",
                wordBreak: "break-all",
              }}
            >
              {provenance.source_artifact_id}
            </span>
          )}
          <span
            className="t-read"
            style={{
              fontSize: 10.5,
              color: provenance.operator_confirmed ? "var(--vr-up)" : "var(--vr-cream-faint)",
              lineHeight: 1.4,
            }}
          >
            {provenance.operator_confirmed ? "✓ Operator confirmed" : "· Awaiting confirmation"}
          </span>
        </span>
      )}
    </span>
  )
}
