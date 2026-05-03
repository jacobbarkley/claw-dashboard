"use client"

// AssumptionCard — surface for one AssumptionItem in the Assumptions &
// Unknowns review screen (UX plan screen 5).
//
// Per UX plan: cards sorted with resolution_needed:true first, then by
// risk_if_wrong HIGH → LOW. This component is one card; sorting/grouping
// is the parent screen's job.
//
// Three actions: Confirm (operator agrees with assumption, sets
// operator_confirmed=true on provenance), Edit (open inline editor — handled
// by parent), Mark for research (defer for follow-up).

import type { AssumptionItem } from "@/lib/research-lab-contracts"

import { ProvenanceChip } from "./provenance-chip"

const RISK_COLOR: Record<AssumptionItem["risk_if_wrong"], string> = {
  LOW: "var(--vr-cream-faint)",
  MEDIUM: "var(--vr-gold)",
  HIGH: "var(--vr-down)",
}

const RISK_LABEL: Record<AssumptionItem["risk_if_wrong"], string> = {
  LOW: "low risk",
  MEDIUM: "medium risk",
  HIGH: "high risk",
}

interface AssumptionCardProps {
  item: AssumptionItem
  onConfirm?: (item: AssumptionItem) => void
  onEdit?: (item: AssumptionItem) => void
  onDefer?: (item: AssumptionItem) => void
  busy?: boolean
}

export function AssumptionCard({ item, onConfirm, onEdit, onDefer, busy = false }: AssumptionCardProps) {
  const riskColor = RISK_COLOR[item.risk_if_wrong]
  const accent = item.resolution_needed ? "var(--vr-gold)" : "var(--vr-line-hi)"

  return (
    <div
      className="vr-card"
      style={{
        borderLeft: `2px solid ${accent}`,
        background: item.resolution_needed ? "var(--vr-gold-soft)" : "transparent",
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span
          className="t-mono"
          style={{
            fontSize: 10,
            color: "var(--vr-cream-mute)",
            wordBreak: "break-all",
          }}
        >
          {item.field_path}
        </span>
        <span
          className="t-eyebrow"
          aria-label={RISK_LABEL[item.risk_if_wrong]}
          style={{
            fontSize: 9,
            letterSpacing: "0.16em",
            color: riskColor,
            border: `1px solid ${riskColor}`,
            padding: "1px 6px",
            borderRadius: 2,
            fontFamily: "var(--ff-mono)",
            textTransform: "uppercase",
          }}
        >
          {item.risk_if_wrong} RISK
        </span>
        <ProvenanceChip provenance={item.provenance} />
      </div>

      {item.resolution_needed && (
        <span
          className="t-eyebrow"
          style={{
            fontSize: 9,
            letterSpacing: "0.16em",
            color: "var(--vr-gold)",
            fontFamily: "var(--ff-mono)",
            textTransform: "uppercase",
          }}
        >
          ⚠ Needs your eyes
        </span>
      )}

      <p
        className="t-read"
        style={{
          margin: 0,
          fontSize: 13,
          color: "var(--vr-cream)",
          lineHeight: 1.5,
        }}
      >
        {item.assumption}
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {onConfirm && (
          <ActionButton
            label="Confirm"
            tone="primary"
            disabled={busy || item.provenance.operator_confirmed}
            onClick={() => onConfirm(item)}
          />
        )}
        {onEdit && <ActionButton label="Edit" tone="secondary" disabled={busy} onClick={() => onEdit(item)} />}
        {onDefer && (
          <ActionButton
            label="Mark for research"
            tone="secondary"
            disabled={busy}
            onClick={() => onDefer(item)}
          />
        )}
      </div>
    </div>
  )
}

function ActionButton({
  label,
  tone,
  disabled,
  onClick,
}: {
  label: string
  tone: "primary" | "secondary"
  disabled?: boolean
  onClick?: () => void
}) {
  const isPrimary = tone === "primary"
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="t-eyebrow"
      style={{
        fontSize: 9.5,
        letterSpacing: "0.16em",
        fontFamily: "var(--ff-mono)",
        textTransform: "uppercase",
        padding: "6px 12px",
        borderRadius: 2,
        border: `1px solid ${isPrimary ? "var(--vr-gold)" : "var(--vr-line-hi)"}`,
        background: isPrimary && !disabled ? "var(--vr-gold)" : "transparent",
        color: isPrimary && !disabled ? "var(--vr-ink)" : "var(--vr-cream-mute)",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  )
}
