"use client"

// ConfidenceBadge — tiny visual indicator for ProvenanceConfidence.
//
// Per UX plan: HIGH = filled solid, MEDIUM = outlined, LOW = dashed-outline.
// Adjacent to ProvenanceChip. Confidence is independent of source — a
// reference-derived field can be HIGH (lifted verbatim) or LOW (extrapolated).

import type { ProvenanceConfidence } from "@/lib/research-lab-contracts"

const CONFIDENCE_LABEL: Record<ProvenanceConfidence, string> = {
  HIGH: "high confidence",
  MEDIUM: "medium confidence",
  LOW: "low confidence",
}

interface ConfidenceBadgeProps {
  level: ProvenanceConfidence
}

export function ConfidenceBadge({ level }: ConfidenceBadgeProps) {
  const baseStyle: React.CSSProperties = {
    display: "inline-block",
    width: 8,
    height: 8,
    borderRadius: "50%",
    verticalAlign: "middle",
  }

  const variantStyle: React.CSSProperties =
    level === "HIGH"
      ? { background: "var(--vr-cream)", border: "1px solid var(--vr-cream)" }
      : level === "MEDIUM"
        ? { background: "transparent", border: "1px solid var(--vr-cream-mute)" }
        : { background: "transparent", border: "1px dashed var(--vr-cream-faint)" }

  return (
    <span
      role="img"
      aria-label={CONFIDENCE_LABEL[level]}
      title={CONFIDENCE_LABEL[level]}
      style={{ ...baseStyle, ...variantStyle }}
    />
  )
}
