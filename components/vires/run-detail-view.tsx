"use client"

// Single-run detail view — opened from a RunCard on the Bench. Renders the
// normalized_detail shape Codex's lib/vires-bench.ts emits via
// loadBenchRunDetail: interpretation, candidates/leaderboard, reject rules,
// and a link into the matching passport when one exists.

import Link from "next/link"
import { InfoPop, SectionHeader, SleeveChip, StatusPill, fmtPct, toneColor, toneOf, type Sleeve } from "./shared"

interface RunCandidate {
  id: string
  label?: string | null
  ret?: number | null
  sharpe?: number | null
  calmar?: number | null
  maxDD?: number | null
  trades?: number | null
  passes?: number | null
  gates?: number | null
  winner?: boolean
  rejected?: boolean
  plateau?: string | null
  note?: string | null
}

interface RunRejectRule {
  gate_id?: string | null
  label?: string | null
  cleared?: number | null
  total?: number | null
}

interface RunBenchmark {
  label?: string | null
  summary?: {
    total_return_pct?: number | null
    sharpe_ratio?: number | null
    calmar_ratio?: number | null
    max_drawdown_pct?: number | null
  } | null
}

interface NormalizedDetail {
  id?: string
  benchmarkName?: string
  benchmark?: RunBenchmark | null
  interpretation?: string | null
  candidates?: RunCandidate[]
  rejectRules?: RunRejectRule[]
  truncated?: boolean
}

interface RunBundle {
  bench_id?: string
  run_id?: string
  title?: string
  sleeve?: string | null
  status?: string | null
  generated_at?: string | null
  evaluated_candidate_count?: number | null
  search_space_size?: number | null
  primary_metric?: string | null
  primary_metric_value?: number | null
}

interface RunSpec {
  title?: string
  sleeve?: string | null
  hypothesis?: string | null
  dataset?: { symbol?: string; start_date?: string; end_date?: string } | null
}

export interface RunDetail {
  bundle?: RunBundle
  spec?: RunSpec | null
  normalized_detail?: NormalizedDetail | null
  passport?: { id: string; sleeve?: string | null } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const SLEEVE_LC: Record<string, Sleeve> = {
  STOCKS: "stocks",
  OPTIONS: "options",
  CRYPTO: "crypto",
}

const STATUS_TONE: Record<string, "up" | "down" | "gold" | "warn" | "neutral"> = {
  SUCCEEDED: "up",
  COMPLETED: "up",
  PARTIAL:   "warn",
  IN_PROGRESS: "warn",
  RUNNING:   "warn",
  FAILED:    "down",
  ERRORED:   "down",
}

function fmtPctSigned(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`
}

function fmtNum(v: number | null | undefined, digits = 2): string {
  return v != null && Number.isFinite(v) ? v.toFixed(digits) : "—"
}

// ─── Candidates leaderboard ────────────────────────────────────────────────

function CandidatesTable({ candidates }: { candidates: RunCandidate[] }) {
  if (!candidates.length) {
    return (
      <div className="vr-card" style={{ padding: 18 }}>
        <div className="t-label" style={{ fontSize: 12 }}>
          No candidate variants recorded for this run yet.
        </div>
      </div>
    )
  }
  return (
    <div className="vr-card">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "28px 1fr 60px 52px 52px 48px",
          gap: 8,
          padding: "10px 16px",
          fontSize: 9,
          color: "var(--vr-cream-mute)",
          textTransform: "uppercase",
          letterSpacing: "0.22em",
          borderBottom: "1px solid var(--vr-line)",
        }}
      >
        <span>#</span>
        <span>Variant</span>
        <span style={{ textAlign: "right" }}>
          Calmar
          <InfoPop term="Calmar" size={9} />
        </span>
        <span style={{ textAlign: "right" }}>Ret</span>
        <span style={{ textAlign: "right" }}>
          Shp
          <InfoPop term="Sharpe" size={9} />
        </span>
        <span style={{ textAlign: "right" }}>
          DD
          <InfoPop term="MaxDD" size={9} />
        </span>
      </div>
      <div className="vr-divide">
        {candidates.map((c, idx) => {
          const retTone = toneOf(c.ret)
          const winner = !!c.winner
          const rejected = !!c.rejected && !winner
          return (
            <div
              key={c.id}
              style={{
                display: "grid",
                gridTemplateColumns: "28px 1fr 60px 52px 52px 48px",
                gap: 8,
                padding: "12px 16px",
                alignItems: "center",
                background: winner ? "rgba(200, 169, 104, 0.06)" : "transparent",
                opacity: rejected ? 0.62 : 1,
              }}
            >
              <span
                style={{
                  fontSize: winner ? 16 : 11,
                  color: winner ? "var(--vr-gold)" : "var(--vr-cream-mute)",
                  fontStyle: winner ? "italic" : "normal",
                  fontFamily: winner ? "var(--ff-serif)" : "var(--ff-mono)",
                }}
              >
                {idx + 1}
              </span>
              <div style={{ minWidth: 0 }}>
                <div
                  className="t-ticker"
                  style={{
                    fontSize: 11,
                    textTransform: "none",
                    color: winner ? "var(--vr-gold)" : "var(--vr-cream-dim)",
                  }}
                >
                  {c.label ?? c.id}
                </div>
                {c.note && (
                  <div className="t-label" style={{ fontSize: 10, color: "var(--vr-cream-mute)", marginTop: 2 }}>
                    {c.note}
                  </div>
                )}
              </div>
              <span className="t-num" style={{ fontSize: 12, color: "var(--vr-cream)", textAlign: "right", fontWeight: 500 }}>
                {fmtNum(c.calmar, 2)}
              </span>
              <span className="t-num" style={{ fontSize: 11, color: toneColor(retTone), textAlign: "right" }}>
                {c.ret != null ? `${c.ret.toFixed(1)}%` : "—"}
              </span>
              <span className="t-num" style={{ fontSize: 11, color: "var(--vr-cream-dim)", textAlign: "right" }}>
                {fmtNum(c.sharpe, 2)}
              </span>
              <span className="t-num" style={{ fontSize: 11, color: "var(--vr-down)", textAlign: "right" }}>
                {c.maxDD != null ? `${c.maxDD.toFixed(1)}%` : "—"}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Reject rules ──────────────────────────────────────────────────────────

function RejectRulesList({ rules }: { rules: RunRejectRule[] }) {
  if (!rules.length) return null
  return (
    <section>
      <SectionHeader eyebrow="Governance" title="Hard-reject rules" />
      <div className="vr-card">
        <div className="vr-divide">
          {rules.map((r, i) => {
            const cleared = r.cleared ?? 0
            const total = r.total ?? 0
            const allCleared = total > 0 && cleared === total
            const noneCleared = total > 0 && cleared === 0
            const tone: "up" | "down" | "warn" =
              allCleared ? "up" : noneCleared ? "down" : "warn"
            return (
              <div
                key={r.gate_id ?? i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 12,
                  padding: "12px 16px",
                  alignItems: "center",
                }}
              >
                <div>
                  <div className="t-label" style={{ fontSize: 12, color: "var(--vr-cream)" }}>
                    {r.label ?? r.gate_id ?? "Gate"}
                  </div>
                  <div className="t-label" style={{ fontSize: 10, color: "var(--vr-cream-mute)", marginTop: 2 }}>
                    {cleared} of {total} variants cleared
                  </div>
                </div>
                <StatusPill tone={tone}>
                  {allCleared ? "ALL PASS" : noneCleared ? "NONE PASS" : "MIXED"}
                </StatusPill>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────

export function ViresRunDetailView({ detail }: { detail: RunDetail | null }) {
  if (!detail || !detail.bundle) {
    return (
      <div className="vr-screen vires-screen-pad" style={{ maxWidth: 860, margin: "0 auto" }}>
        <Link
          href="/vires/bench"
          className="t-eyebrow"
          style={{ fontSize: 9, color: "var(--vr-cream-mute)", textDecoration: "none" }}
        >
          ← Back to Bench
        </Link>
        <div className="vr-card" style={{ padding: 24, marginTop: 14 }}>
          <div className="t-eyebrow" style={{ marginBottom: 6 }}>Run not found</div>
          <div className="t-label">
            The bench + run id don&rsquo;t match any published artifacts.
          </div>
        </div>
      </div>
    )
  }

  const bundle = detail.bundle
  const spec = detail.spec ?? null
  const n = detail.normalized_detail ?? null
  const sleeve = SLEEVE_LC[(bundle.sleeve ?? "STOCKS").toUpperCase()] ?? "stocks"
  const statusTone = STATUS_TONE[(bundle.status ?? "").toUpperCase()] ?? "neutral"
  const benchSummary = n?.benchmark?.summary ?? {}
  const passportHref = detail.passport
    ? `/vires/bench/passport/${encodeURIComponent(detail.passport.id)}`
    : null

  return (
    <div
      className="vr-screen vires-screen-pad"
      style={{ maxWidth: 860, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}
    >
      <Link
        href="/vires/bench"
        className="t-eyebrow"
        style={{
          fontSize: 9,
          color: "var(--vr-cream-mute)",
          textDecoration: "none",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          alignSelf: "flex-start",
        }}
      >
        ← Back to Bench
      </Link>

      {/* Identity */}
      <div style={{ padding: "4px 2px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <SleeveChip sleeve={sleeve} />
          {bundle.status && <StatusPill tone={statusTone}>{bundle.status}</StatusPill>}
          <span className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-cream-faint)" }}>
            · Bench Run
          </span>
        </div>
        <div className="t-h1" style={{ fontSize: 28, lineHeight: 1.15, letterSpacing: "-0.01em" }}>
          {bundle.title ?? spec?.title ?? bundle.bench_id ?? "Run"}
        </div>
        <div className="t-ticker" style={{ fontSize: 10, color: "var(--vr-cream-mute)", marginTop: 6, textTransform: "none" }}>
          {bundle.bench_id} · {bundle.run_id}
        </div>
        {spec?.hypothesis && (
          <div className="t-read" style={{ fontSize: 13, color: "var(--vr-cream-dim)", marginTop: 10, lineHeight: 1.55 }}>
            {spec.hypothesis}
          </div>
        )}
        <div style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap" }}>
          <div>
            <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 3 }}>Primary</div>
            <div className="t-num" style={{ fontSize: 13, color: "var(--vr-gold)", fontWeight: 500 }}>
              {bundle.primary_metric_value != null ? bundle.primary_metric_value.toFixed(4) : "—"}
            </div>
            <div className="t-label" style={{ fontSize: 10, color: "var(--vr-cream-mute)", marginTop: 2 }}>
              {bundle.primary_metric ?? "metric"}
            </div>
          </div>
          <div style={{ borderLeft: "1px solid var(--vr-line)", paddingLeft: 16 }}>
            <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 3 }}>Evaluated</div>
            <div className="t-num" style={{ fontSize: 13, color: "var(--vr-cream)" }}>
              {(bundle.evaluated_candidate_count ?? 0).toLocaleString("en-US")}
              {bundle.search_space_size != null && (
                <span style={{ color: "var(--vr-cream-faint)" }}> / {bundle.search_space_size.toLocaleString("en-US")}</span>
              )}
            </div>
          </div>
          {spec?.dataset && (
            <div style={{ borderLeft: "1px solid var(--vr-line)", paddingLeft: 16 }}>
              <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 3 }}>Dataset</div>
              <div className="t-ticker" style={{ fontSize: 11, color: "var(--vr-cream)", textTransform: "none" }}>
                {spec.dataset.symbol ?? "—"}
                {spec.dataset.start_date && ` · ${spec.dataset.start_date.slice(0, 7)} → ${(spec.dataset.end_date ?? "").slice(0, 7)}`}
              </div>
            </div>
          )}
          {passportHref && (
            <Link
              href={passportHref}
              className="t-eyebrow"
              style={{
                fontSize: 9,
                color: "var(--vr-gold)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                borderLeft: "1px solid var(--vr-line)",
                paddingLeft: 16,
              }}
            >
              View Passport
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path d="M2 1L6 4L2 7" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </Link>
          )}
        </div>
      </div>

      {/* Interpretation */}
      {n?.interpretation && (
        <div className="vr-card" style={{ padding: 18 }}>
          <div className="t-eyebrow" style={{ marginBottom: 8 }}>Interpretation</div>
          <div className="t-read" style={{ fontSize: 13, lineHeight: 1.6 }}>
            {n.interpretation}
          </div>
          {n.truncated && (
            <div
              className="t-label"
              style={{ fontSize: 10, marginTop: 10, color: "var(--vr-gold)", letterSpacing: "0.06em" }}
            >
              ⚠ RUN TRUNCATED · hit the candidate cap before exhausting the search space
            </div>
          )}
        </div>
      )}

      {/* Benchmark summary */}
      {n?.benchmark && (benchSummary.total_return_pct != null || benchSummary.sharpe_ratio != null) && (
        <section>
          <SectionHeader
            eyebrow="Benchmark"
            title={n.benchmarkName ?? "Reference"}
          />
          <div className="vr-card">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 0,
              }}
            >
              {[
                { label: "Total Return", term: "TotalReturn", value: fmtPctSigned(benchSummary.total_return_pct) },
                { label: "Sharpe",       term: "Sharpe",      value: fmtNum(benchSummary.sharpe_ratio, 2) },
                { label: "Calmar",       term: "Calmar",      value: fmtNum(benchSummary.calmar_ratio, 2) },
                { label: "Max DD",       term: "MaxDD",       value: benchSummary.max_drawdown_pct != null ? `${benchSummary.max_drawdown_pct.toFixed(1)}%` : "—" },
              ].map((m, i) => (
                <div
                  key={m.label}
                  style={{
                    padding: "12px 14px",
                    borderLeft: i > 0 ? "1px solid var(--vr-line)" : "none",
                  }}
                >
                  <div className="t-eyebrow" style={{ fontSize: 9, display: "flex", alignItems: "center", marginBottom: 5 }}>
                    {m.label}
                    <InfoPop term={m.term} size={9} />
                  </div>
                  <div className="t-num" style={{ fontSize: 14, color: "var(--vr-cream)", fontWeight: 500 }}>
                    {m.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Candidates / leaderboard */}
      <section>
        <SectionHeader
          eyebrow="Leaderboard"
          title="Candidate variants"
          right={<span className="t-label" style={{ fontSize: 10 }}>{(n?.candidates ?? []).length} total</span>}
        />
        <CandidatesTable candidates={n?.candidates ?? []} />
      </section>

      {/* Reject rules */}
      <RejectRulesList rules={n?.rejectRules ?? []} />

      {/* Suppress unused-import warning for fmtPct until downstream. */}
      {(false as boolean) && <span>{fmtPct(0)}</span>}
    </div>
  )
}
