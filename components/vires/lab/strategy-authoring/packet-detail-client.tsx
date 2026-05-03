"use client"

// PacketDetailClient — first real workflow screen for Strategy Authoring.
// Renders a PacketLifecycleView and wires the two PATCH actions Codex shipped:
// confirm_strategy_id and transition_status.
//
// Per UX plan: this is the minimum-viable packet detail surface. Heavier
// screens (full Packet Review, Adversarial Review with reviewer running, full
// Compiler Output panel) will compose more primitives once the backend gates
// land for those flows.
//
// Built against:
//   - GET/PATCH /api/research/strategy-authoring/packets/[id] (commit 8686c300)
//   - PacketLifecycleView shape (lib/research-lab-strategy-authoring-lifecycle.server)

import { useRouter } from "next/navigation"
import { useState } from "react"

import type {
  AdversarialCheckCategory,
  PacketCompileResultV1,
  ScopeTriple,
  StrategyAuthoringPacketStatus,
  StrategyAuthoringPacketV1,
  TrialLedgerEntryV1,
} from "@/lib/research-lab-contracts"
import type { StrategyAuthoringValidationIssue } from "@/lib/research-lab-strategy-authoring"

import { AssumptionCard } from "./assumption-card"
import { ProvenanceChip } from "./provenance-chip"

interface PacketLifecycleViewClient {
  packet: StrategyAuthoringPacketV1
  compile_result: PacketCompileResultV1
  validation_issues: StrategyAuthoringValidationIssue[]
  trial_ledger_entries: TrialLedgerEntryV1[]
}

interface PacketDetailClientProps {
  initialView: PacketLifecycleViewClient
  scope: ScopeTriple
}

const STATUS_COLOR: Record<StrategyAuthoringPacketStatus, string> = {
  DRAFT: "var(--vr-cream-faint)",
  REVIEW: "var(--vr-gold)",
  ADVERSARIAL: "var(--vr-gold)",
  APPROVED: "var(--vr-up)",
  REJECTED: "var(--vr-down)",
  ARCHIVED: "var(--vr-cream-faint)",
}

// Legal forward transitions surfaced as operator buttons. Backend is the
// source of truth and will reject illegal transitions; this map controls UX.
const LEGAL_TRANSITIONS: Partial<Record<StrategyAuthoringPacketStatus, StrategyAuthoringPacketStatus[]>> = {
  DRAFT: ["REVIEW", "REJECTED"],
  REVIEW: ["ADVERSARIAL", "REJECTED"],
  ADVERSARIAL: ["APPROVED", "REJECTED"],
  APPROVED: ["ARCHIVED"],
  REJECTED: ["ARCHIVED"],
}

export function PacketDetailClient({ initialView, scope }: PacketDetailClientProps) {
  const router = useRouter()
  const [view, setView] = useState(initialView)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [slugDraft, setSlugDraft] = useState(view.packet.strategy_spec.strategy_id.value)

  const packet = view.packet
  const slugProvenance = packet.strategy_spec.strategy_id.provenance
  const slugConfirmed = slugProvenance.operator_confirmed
  const slugDirty = slugDraft.trim() !== packet.strategy_spec.strategy_id.value

  const patch = async (body: Record<string, unknown>): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/research/strategy-authoring/packets/${encodeURIComponent(packet.packet_id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope, ...body }),
        },
      )
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string
        packet?: StrategyAuthoringPacketV1
        compile_result?: PacketCompileResultV1
        validation_issues?: StrategyAuthoringValidationIssue[]
        trial_ledger_entries?: TrialLedgerEntryV1[]
      }
      if (!res.ok) throw new Error(payload.error ?? `Mutation failed (${res.status})`)
      if (payload.packet && payload.compile_result) {
        setView({
          packet: payload.packet,
          compile_result: payload.compile_result,
          validation_issues: payload.validation_issues ?? [],
          trial_ledger_entries: payload.trial_ledger_entries ?? [],
        })
        setSlugDraft(payload.packet.strategy_spec.strategy_id.value)
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mutation failed")
    } finally {
      setBusy(false)
    }
  }

  const onConfirmSlug = () =>
    patch({
      action: "confirm_strategy_id",
      strategy_id: slugDirty ? slugDraft.trim() : undefined,
    })

  const onTransition = (next: StrategyAuthoringPacketStatus) =>
    patch({ action: "transition_status", next_status: next })

  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "32px 20px 120px",
        display: "flex",
        flexDirection: "column",
        gap: 28,
      }}
    >
      <PacketHeader packet={packet} />

      {error && (
        <div
          className="t-read"
          style={{
            fontSize: 12,
            color: "var(--vr-down)",
            border: "1px solid rgba(220,95,95,0.45)",
            borderRadius: 3,
            padding: "8px 12px",
            lineHeight: 1.5,
          }}
        >
          {error}
        </div>
      )}

      <Section title="Strategy spec" subtitle="Confirm the slug before approval. Mutable until status is APPROVED.">
        <div className="vr-card" style={cardStyle}>
          <KeyVal label="Family" value={packet.strategy_spec.strategy_family} />
          <KeyVal label="Sleeve" value={packet.strategy_spec.sleeve} />
          <KeyVal label="Name" value={packet.strategy_spec.strategy_name} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="t-eyebrow" style={eyebrowStyle}>
              STRATEGY ID (SLUG)
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <input
                type="text"
                value={slugDraft}
                onChange={e => setSlugDraft(e.target.value)}
                disabled={busy || packet.status === "APPROVED" || packet.status === "ARCHIVED"}
                spellCheck={false}
                className="t-mono"
                style={inputStyle}
              />
              <ProvenanceChip provenance={slugProvenance} />
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={onConfirmSlug}
                disabled={
                  busy ||
                  packet.status === "APPROVED" ||
                  packet.status === "ARCHIVED" ||
                  (slugConfirmed && !slugDirty) ||
                  !slugDraft.trim()
                }
                style={{
                  ...primaryButton,
                  background: "var(--vr-gold)",
                  color: "var(--vr-ink)",
                  borderColor: "var(--vr-gold)",
                  opacity: slugConfirmed && !slugDirty ? 0.5 : 1,
                }}
              >
                {slugDirty ? "Save & confirm" : slugConfirmed ? "Confirmed" : "Confirm"}
              </button>
              {!slugConfirmed && !slugDirty && (
                <span className="t-read" style={{ fontSize: 11, color: "var(--vr-cream-faint)" }}>
                  Operator confirmation required before APPROVED.
                </span>
              )}
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Assumptions & unknowns"
        subtitle={
          packet.assumptions.items.length === 0
            ? "Talon flagged no assumptions — every field came from your inputs or hard references."
            : `${packet.assumptions.items.length} assumption${packet.assumptions.items.length > 1 ? "s" : ""} — review before approval. Per-assumption confirmation API not wired yet; these are read-only.`
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {packet.assumptions.items.map(item => (
            <AssumptionCard key={item.field_path} item={item} />
          ))}
        </div>
      </Section>

      <Section title="Adversarial review" subtitle="Different-family reviewer hunts lookahead, survivorship bias, leakage, etc.">
        <div className="vr-card" style={cardStyle}>
          <KeyVal label="Status" value={packet.adversarial_review.status} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="t-eyebrow" style={eyebrowStyle}>
              REQUIRED CATEGORIES
            </span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {packet.adversarial_review.required_categories.map(cat => {
                const checked = packet.adversarial_review.checks.find(c => c.category === cat)
                return <CategoryPill key={cat} category={cat} state={checked?.passed} pending={!checked} />
              })}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Compile preview" subtitle="Compiler-stub output — what would happen if you launched this on the bench right now.">
        <div className="vr-card" style={cardStyle}>
          <KeyVal label="Status" value={view.compile_result.compile_status} />
          <KeyVal label="Bench config ID" value={view.compile_result.bench_config_id} mono />
          <KeyVal
            label="Planned trial ledger rows"
            value={String(view.compile_result.planned_trial_ledger_entries.length)}
          />
          {view.compile_result.issues.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="t-eyebrow" style={eyebrowStyle}>
                COMPILER ISSUES ({view.compile_result.issues.length})
              </span>
              <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 4 }}>
                {view.compile_result.issues.map((issue, i) => (
                  <li
                    key={i}
                    className="t-read"
                    style={{
                      fontSize: 11.5,
                      color: issue.code === "INVALID_PACKET" ? "var(--vr-down)" : "var(--vr-gold)",
                      lineHeight: 1.4,
                    }}
                  >
                    <span className="t-mono" style={{ fontSize: 10, opacity: 0.8 }}>
                      [{issue.code}]
                    </span>{" "}
                    {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Section>

      <Section title="Status transitions" subtitle="Operator-initiated lifecycle moves. Backend enforces gating (slug confirmation, adversarial PASS, compile PASS, etc.).">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(LEGAL_TRANSITIONS[packet.status] ?? []).map(next => (
            <button
              key={next}
              type="button"
              onClick={() => onTransition(next)}
              disabled={busy}
              style={{
                ...primaryButton,
                background:
                  next === "APPROVED"
                    ? "var(--vr-up)"
                    : next === "REJECTED"
                      ? "transparent"
                      : "transparent",
                color: next === "APPROVED" ? "var(--vr-ink)" : STATUS_COLOR[next],
                borderColor: STATUS_COLOR[next],
              }}
            >
              → {next}
            </button>
          ))}
          {(LEGAL_TRANSITIONS[packet.status] ?? []).length === 0 && (
            <span className="t-read" style={{ fontSize: 11.5, color: "var(--vr-cream-faint)" }}>
              No further transitions available from {packet.status}.
            </span>
          )}
        </div>
      </Section>

      {view.validation_issues.length > 0 && (
        <Section title="Validation issues (live)" subtitle="From the contract validator. Errors block APPROVED transition; warnings are advisory.">
          <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 6 }}>
            {view.validation_issues.map((issue, i) => (
              <li
                key={i}
                className="t-read"
                style={{
                  fontSize: 11.5,
                  color: issue.severity === "error" ? "var(--vr-down)" : "var(--vr-gold)",
                  lineHeight: 1.4,
                }}
              >
                <span className="t-mono" style={{ fontSize: 10, opacity: 0.8 }}>
                  [{issue.severity.toUpperCase()} · {issue.code}]
                </span>{" "}
                {issue.field_path}: {issue.message}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </main>
  )
}

function PacketHeader({ packet }: { packet: StrategyAuthoringPacketV1 }) {
  return (
    <header style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <span className="t-eyebrow" style={{ fontSize: 10, letterSpacing: "0.16em", color: "var(--vr-cream-mute)" }}>
        STRATEGY AUTHORING PACKET
      </span>
      <h1
        style={{
          margin: 0,
          fontFamily: "var(--ff-serif)",
          fontSize: 26,
          color: "var(--vr-cream)",
          lineHeight: 1.2,
        }}
      >
        {packet.strategy_spec.strategy_name}
      </h1>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <StatusBadge status={packet.status} />
        <span className="t-mono" style={{ fontSize: 10.5, color: "var(--vr-cream-faint)" }}>
          {packet.packet_id}
        </span>
        {packet.revised_from && packet.revision_index ? (
          <span className="t-mono" style={{ fontSize: 10.5, color: "var(--vr-gold)" }}>
            · Revision {packet.revision_index} of{" "}
            <span style={{ wordBreak: "break-all" }}>{packet.revised_from}</span>
          </span>
        ) : null}
      </div>
    </header>
  )
}

function StatusBadge({ status }: { status: StrategyAuthoringPacketStatus }) {
  const color = STATUS_COLOR[status]
  return (
    <span
      className="t-eyebrow"
      style={{
        fontSize: 9,
        letterSpacing: "0.16em",
        color,
        border: `1px solid ${color}`,
        padding: "2px 8px",
        borderRadius: 2,
        fontFamily: "var(--ff-mono)",
      }}
    >
      {status}
    </span>
  )
}

function CategoryPill({
  category,
  state,
  pending,
}: {
  category: AdversarialCheckCategory
  state: boolean | undefined
  pending: boolean
}) {
  const color = pending
    ? "var(--vr-cream-faint)"
    : state
      ? "var(--vr-up)"
      : "var(--vr-down)"
  return (
    <span
      className="t-eyebrow"
      style={{
        fontSize: 8.5,
        letterSpacing: "0.12em",
        color,
        border: `1px solid ${color}`,
        padding: "1px 6px",
        borderRadius: 2,
        fontFamily: "var(--ff-mono)",
      }}
    >
      {pending ? "· " : state ? "✓ " : "✗ "}
      {category}
    </span>
  )
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="t-eyebrow" style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--vr-gold)" }}>
          {title}
        </span>
        {subtitle && (
          <span className="t-read" style={{ fontSize: 11.5, color: "var(--vr-cream-dim)", lineHeight: 1.5 }}>
            {subtitle}
          </span>
        )}
      </div>
      {children}
    </section>
  )
}

function KeyVal({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span className="t-eyebrow" style={eyebrowStyle}>
        {label.toUpperCase()}
      </span>
      <span
        className={mono ? "t-mono" : "t-read"}
        style={{
          fontSize: mono ? 11 : 13,
          color: "var(--vr-cream)",
          wordBreak: mono ? "break-all" : "normal",
        }}
      >
        {value}
      </span>
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  padding: "12px 14px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
}

const eyebrowStyle: React.CSSProperties = {
  fontSize: 9,
  letterSpacing: "0.16em",
  color: "var(--vr-cream-faint)",
  fontFamily: "var(--ff-mono)",
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 240,
  fontSize: 12,
  color: "var(--vr-cream)",
  background: "var(--vr-ink)",
  border: "1px solid var(--vr-line)",
  borderRadius: 2,
  padding: "6px 8px",
  outline: "none",
  fontFamily: "var(--ff-mono)",
}

const primaryButton: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: "0.16em",
  fontFamily: "var(--ff-mono)",
  textTransform: "uppercase",
  padding: "7px 14px",
  borderRadius: 3,
  border: "1px solid",
  cursor: "pointer",
}
