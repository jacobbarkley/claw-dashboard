// Shared primitives for the Guided preview surfaces. Banner +
// evidence display + helpers used across the slice.

import type { CSSProperties, ReactNode } from "react"
import type { GuidedEvidenceRecord, GuidedPendingUserAction } from "./types"

// ─── CANDIDATE / internal-preview banner ────────────────────────────────────
// Hard rule from the spec: anything CANDIDATE is visibly non-public.
// This banner rides every Guided preview screen so the discipline is loud.

export function InternalPreviewBanner({ context = "PRE-ADMISSION" }: { context?: string }) {
  return (
    <div
      role="status"
      aria-label="Internal preview banner"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        marginBottom: 14,
        border: "1px solid #c8a96833",
        borderRadius: 3,
        background: "linear-gradient(180deg, rgba(200,169,104,0.12), rgba(200,169,104,0.04))",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          background: "var(--vr-gold, #c8a968)",
          borderRadius: "50%",
          boxShadow: "0 0 8px #c8a96866",
        }}
      />
      <span
        className="t-eyebrow"
        style={{
          fontSize: 9,
          color: "var(--vr-gold, #c8a968)",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        Internal preview · {context}
      </span>
    </div>
  )
}

// ─── Section divider with serif label ──────────────────────────────────────

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        marginTop: 18,
        marginBottom: 8,
        fontFamily: "var(--ff-serif)",
        fontStyle: "italic",
        fontSize: 18,
        color: "var(--vr-cream, #f1ece0)",
      }}
    >
      {children}
    </div>
  )
}

// ─── Eyebrow above field rows ──────────────────────────────────────────────

export function FieldEyebrow({ children }: { children: ReactNode }) {
  return (
    <div
      className="t-eyebrow"
      style={{
        fontSize: 9,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: "var(--vr-cream-mute, #8c8579)",
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  )
}

// ─── Evidence as five orthogonal dimensions ─────────────────────────────────
// Standing principle: never collapse evidence into a single performance
// number. Render the 5 dimensions separately, with the evidence type as a
// type label (not a strength score).

const EVIDENCE_TYPE_LABELS: Record<GuidedEvidenceRecord["evidence_type"], string> = {
  BACKTEST: "Historical backtest",
  SHADOW_FORWARD_OBSERVED: "Shadow forward (signals only, no fills)",
  BENCH_MULTI_ERA: "Bench multi-era backtest",
  PAPER_FORWARD_SANDBOX: "Paper-forward (sandbox)",
  PAPER_FORWARD_PROMOTED: "Paper-forward (this enrollment)",
  LIVE_OBSERVED: "Live observed",
}

const BROKER_REALISM_LABELS: Record<GuidedEvidenceRecord["broker_realism"], string> = {
  NONE: "no broker (signals only)",
  SIMULATED: "simulated fills",
  PAPER_BROKER: "paper broker",
  LIVE_BROKER: "live broker",
}

const FILL_REALISM_LABELS: Record<GuidedEvidenceRecord["fill_realism"], string> = {
  NONE: "no fills",
  MIDPOINT_SIMULATED: "midpoint simulated",
  SPREAD_AWARE_SIMULATED: "spread-aware simulated",
  PAPER_FILLS: "paper fills",
  LIVE_FILLS: "live fills",
}

export function EvidenceCard({ evidence, compact = false }: { evidence: GuidedEvidenceRecord; compact?: boolean }) {
  const f = evidence.freshness
  const fresh = formatDateOnly(f.last_evaluated_at)
  const window = `${formatDateOnly(f.data_window_start)} → ${formatDateOnly(f.data_window_end)}`
  const cellStyle: CSSProperties = {
    fontSize: 11,
    color: "var(--vr-cream-dim, #c4bdac)",
    fontFamily: "var(--ff-mono)",
  }
  const labelStyle: CSSProperties = {
    fontSize: 9,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "var(--vr-cream-mute, #8c8579)",
    marginBottom: 2,
  }
  return (
    <div
      style={{
        padding: 14,
        border: "1px solid var(--vr-line, #2a2438)",
        borderRadius: 3,
        background: "rgba(241,236,224,0.02)",
        marginBottom: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span
          className="t-eyebrow"
          style={{
            fontSize: 9,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--vr-gold, #c8a968)",
          }}
        >
          {EVIDENCE_TYPE_LABELS[evidence.evidence_type]}
        </span>
        <span style={cellStyle}>evaluated {fresh}</span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: compact ? "1fr 1fr" : "1fr 1fr 1fr",
          gap: 12,
        }}
      >
        <div>
          <div style={labelStyle}>Freshness</div>
          <div style={cellStyle}>{f.staleness_policy.replace(/_/g, " ")}</div>
          <div style={{ ...cellStyle, fontSize: 10, color: "var(--vr-cream-mute, #8c8579)" }}>{window}</div>
        </div>
        <div>
          <div style={labelStyle}>Sample size</div>
          <div style={cellStyle}>
            {evidence.sample_size != null ? `${evidence.sample_size.toLocaleString()} obs` : "—"}
          </div>
        </div>
        <div>
          <div style={labelStyle}>Regime coverage</div>
          <div style={cellStyle}>
            {evidence.regime_coverage.length > 0 ? evidence.regime_coverage.join(", ") : "—"}
          </div>
        </div>
        <div>
          <div style={labelStyle}>Broker realism</div>
          <div style={cellStyle}>{BROKER_REALISM_LABELS[evidence.broker_realism]}</div>
        </div>
        <div>
          <div style={labelStyle}>Fill realism</div>
          <div style={cellStyle}>{FILL_REALISM_LABELS[evidence.fill_realism]}</div>
        </div>
        {evidence.notes.length > 0 ? (
          <div>
            <div style={labelStyle}>Notes</div>
            <div style={{ ...cellStyle, fontSize: 10 }}>{evidence.notes.join(" · ")}</div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ─── Sleeve hero card wrapper (Vires aesthetic, but Guided-aware) ──────────

export function GuidedHeroCard({
  children,
  accent = "var(--vr-sleeve-stocks, #c8a968)",
  style,
}: {
  children: ReactNode
  accent?: string
  style?: CSSProperties
}) {
  return (
    <div
      style={{
        padding: 22,
        border: `1px solid ${accent}33`,
        borderRadius: 4,
        background: "linear-gradient(180deg, rgba(241,236,224,0.025), rgba(241,236,224,0.01))",
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function formatDateOnly(iso: string): string {
  return iso.slice(0, 10)
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC"
}

export function formatUsd(n: number, opts: { sign?: boolean } = {}): string {
  const { sign = false } = opts
  const abs = Math.abs(n)
  const signChar = n > 0 ? (sign ? "+" : "") : n < 0 ? "−" : ""
  const body = abs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  return `${signChar}$${body}`
}

export function PendingUserActionsBanner({ actions }: { actions: GuidedPendingUserAction[] }) {
  if (actions.length === 0) return null
  return (
    <div
      role="status"
      aria-label="Pending action banner"
      style={{
        padding: "12px 14px",
        marginBottom: 14,
        border: "1px solid var(--vr-gold, #c8a968)55",
        background: "rgba(200,169,104,0.07)",
        borderRadius: 3,
      }}
    >
      <div
        style={{
          fontSize: 9,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--vr-gold, #c8a968)",
          fontWeight: 600,
          marginBottom: 6,
        }}
      >
        Action needed
      </div>
      <ul style={{ margin: 0, paddingLeft: 20, color: "var(--vr-cream-dim, #c4bdac)", fontSize: 12, lineHeight: 1.55 }}>
        {actions.map(a => (
          <li key={a.action_id}>
            <strong style={{ color: "var(--vr-cream, #f1ece0)", fontWeight: 600 }}>
              {a.action_type.replace(/_/g, " ")}
            </strong>
            {": "}
            {a.reason_label}
            {a.due_at ? (
              <span style={{ fontSize: 10, color: "var(--vr-cream-mute, #8c8579)", marginLeft: 6 }}>
                · due {a.due_at.slice(0, 10)}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function MockFallbackBadge({ reason }: { reason: string }) {
  return (
    <div
      role="status"
      aria-label="Mock fallback notice"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        marginBottom: 12,
        border: "1px dashed #c8a96866",
        borderRadius: 3,
        background: "rgba(200,169,104,0.04)",
      }}
    >
      <span
        className="t-eyebrow"
        style={{
          fontSize: 9,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--vr-gold, #c8a968)",
          fontWeight: 600,
        }}
      >
        Mock fallback
      </span>
      <span style={{ fontSize: 10, color: "var(--vr-cream-mute, #8c8579)" }}>{reason}</span>
    </div>
  )
}

export function PreviewPageShell({
  title,
  subtitle,
  surfaceId,
  children,
}: {
  title: string
  subtitle?: string
  surfaceId: string
  children: ReactNode
}) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--vr-bg, #0c0a17)",
        padding: "24px 16px 80px",
      }}
    >
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <a
          href="/vires/guided/preview"
          style={{
            display: "inline-block",
            fontSize: 10,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--vr-cream-mute, #8c8579)",
            textDecoration: "none",
            marginBottom: 12,
          }}
        >
          ← All Guided previews
        </a>
        <InternalPreviewBanner context={`Stage 2 · ${surfaceId}`} />
        <div style={{ marginBottom: 20 }}>
          <h1
            style={{
              marginTop: 0,
              fontSize: 24,
              fontFamily: "var(--ff-serif)",
              fontStyle: "italic",
              color: "var(--vr-cream, #f1ece0)",
              fontWeight: 400,
            }}
          >
            {title}
          </h1>
          {subtitle ? (
            <p
              style={{
                marginTop: 6,
                fontSize: 12,
                color: "var(--vr-cream-mute, #8c8579)",
                lineHeight: 1.5,
              }}
            >
              {subtitle}
            </p>
          ) : null}
        </div>
        {children}
      </div>
    </main>
  )
}
