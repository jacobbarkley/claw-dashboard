// Result leaderboard for a completed Research Lab job. Reads result.v1
// directly — no transformation, no inferred fields. Winner is flagged by
// result.variants[].winner; rank comes from result.variants[].rank.
// Plateau analysis + benchmark ride along as header chips.

import type { PlateauAnalysis, ResultV1 } from "@/lib/research-lab-contracts"

const PLATEAU_META: Record<PlateauAnalysis, { label: string; color: string; note: string }> = {
  STABLE: {
    label: "Stable plateau",
    color: "var(--vr-up)",
    note: "Top variants cluster tightly — edge is robust across neighbors.",
  },
  LUCKY_PEAK: {
    label: "Lucky peak",
    color: "var(--vr-down)",
    note: "Winner is isolated. Likely overfit to the specific params, not a durable edge.",
  },
  MIXED: {
    label: "Mixed",
    color: "var(--vr-gold)",
    note: "Plateau is uneven. Winner is probably real but depth isn't certain.",
  },
  INSUFFICIENT_EVIDENCE: {
    label: "Insufficient evidence",
    color: "var(--vr-cream-mute)",
    note: "Not enough surviving variants to judge plateau shape.",
  },
}

function fmtPct(n: number | null | undefined, decimals = 2): string {
  if (n == null || !Number.isFinite(n)) return "—"
  const sign = n > 0 ? "+" : ""
  return `${sign}${n.toFixed(decimals)}%`
}

function fmtNum(n: number | null | undefined, decimals = 2): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return n.toFixed(decimals)
}

function fmtInt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return Math.round(n).toString()
}

function paramSummary(params: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(params)) {
    parts.push(`${k}=${String(v)}`)
  }
  return parts.join(" · ") || "—"
}

export function ResultLeaderboard({ result }: { result: ResultV1 }) {
  const plateau = PLATEAU_META[result.plateau_analysis]
  const variants = [...result.variants].sort((a, b) => {
    const ra = a.rank ?? Number.POSITIVE_INFINITY
    const rb = b.rank ?? Number.POSITIVE_INFINITY
    return ra - rb
  })

  return (
    <div
      className="vr-card"
      style={{
        padding: 0,
        background: "var(--vr-ink)",
      }}
    >
      {/* Header strip */}
      <div
        style={{
          padding: "14px 16px 12px",
          borderBottom: "1px solid var(--vr-line)",
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--ff-serif)",
              fontStyle: "italic",
              fontSize: 18,
              fontWeight: 400,
              color: "var(--vr-cream)",
              lineHeight: 1.15,
            }}
          >
            Leaderboard
          </h2>
          <div
            style={{
              marginTop: 4,
              fontFamily: "var(--ff-mono)",
              fontSize: 10.5,
              color: "var(--vr-cream-mute)",
            }}
          >
            {variants.length} variant{variants.length === 1 ? "" : "s"} · completed{" "}
            {result.completed_at}
          </div>
        </div>
        <span
          className="t-eyebrow"
          style={{
            padding: "3px 8px",
            fontSize: 9,
            letterSpacing: "0.14em",
            borderRadius: 2,
            border: `1px solid ${plateau.color}`,
            color: plateau.color,
          }}
        >
          {plateau.label}
          {result.plateau_spread != null ? ` · spread ${result.plateau_spread.toFixed(2)}` : ""}
        </span>
      </div>

      {/* Plateau note */}
      <div
        style={{
          padding: "10px 16px 0",
          fontSize: 12,
          fontFamily: "var(--ff-serif)",
          fontStyle: "italic",
          color: "var(--vr-cream-dim)",
          lineHeight: 1.55,
        }}
      >
        {plateau.note}
      </div>

      {/* Benchmark line */}
      {result.benchmark && (
        <div
          style={{
            padding: "10px 16px 0",
            fontSize: 11,
            color: "var(--vr-cream-mute)",
            fontFamily: "var(--ff-mono)",
          }}
        >
          benchmark · {result.benchmark.symbol} ·{" "}
          <span style={{ color: "var(--vr-cream)" }}>
            {fmtPct(result.benchmark.total_return_pct)} · sharpe {fmtNum(result.benchmark.sharpe_ratio)}
          </span>
        </div>
      )}

      {/* Rows */}
      <div style={{ padding: "12px 0 4px" }}>
        {variants.map((v, idx) => {
          const m = v.metrics
          const lastRow = idx === variants.length - 1
          const rowBg = v.winner ? "rgba(200,169,104,0.06)" : "transparent"
          return (
            <div
              key={v.variant_id}
              style={{
                padding: "10px 16px",
                background: rowBg,
                borderBottom: lastRow ? "none" : "1px solid var(--vr-line)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 8,
                  marginBottom: 6,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                  <span
                    className="t-mono"
                    style={{
                      fontSize: 10,
                      color: "var(--vr-cream-mute)",
                      minWidth: 18,
                      textAlign: "right",
                    }}
                  >
                    #{v.rank ?? idx + 1}
                  </span>
                  <span
                    className="t-mono"
                    style={{
                      fontSize: 12,
                      color: "var(--vr-cream)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {v.variant_id}
                  </span>
                  {v.winner ? (
                    <span
                      className="t-eyebrow"
                      style={{
                        fontSize: 9,
                        color: "var(--vr-gold)",
                        border: "1px solid var(--vr-gold)",
                        padding: "1px 6px",
                        borderRadius: 2,
                        letterSpacing: "0.14em",
                      }}
                    >
                      Winner
                    </span>
                  ) : null}
                </div>
                <div
                  className="t-mono"
                  style={{ fontSize: 10.5, color: "var(--vr-cream-mute)" }}
                >
                  {paramSummary(v.params)}
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))",
                  gap: 8,
                  rowGap: 4,
                  fontSize: 11,
                  fontFamily: "var(--ff-mono)",
                }}
              >
                <Cell label="return" value={fmtPct(m.total_return_pct)} tone="main" />
                <Cell label="sharpe" value={fmtNum(m.sharpe_ratio)} />
                <Cell label="sortino" value={fmtNum(m.sortino_ratio)} />
                <Cell label="calmar" value={fmtNum(m.calmar_ratio)} />
                <Cell
                  label="max dd"
                  value={
                    m.max_drawdown_pct == null
                      ? "—"
                      : `${m.max_drawdown_pct > 0 ? "-" : ""}${Math.abs(m.max_drawdown_pct).toFixed(2)}%`
                  }
                  tone="down"
                />
                <Cell label="pf" value={fmtNum(m.profit_factor)} />
                <Cell label="win %" value={m.win_rate_pct == null ? "—" : `${m.win_rate_pct.toFixed(1)}%`} />
                <Cell label="trades" value={fmtInt(m.trades)} />
              </div>

              {v.era_scores && v.era_scores.length > 0 ? (
                <div
                  style={{
                    marginTop: 8,
                    display: "flex",
                    gap: 4,
                    alignItems: "center",
                    flexWrap: "wrap",
                    fontFamily: "var(--ff-mono)",
                    fontSize: 10,
                    color: "var(--vr-cream-mute)",
                  }}
                >
                  eras:
                  {v.era_scores.map((e, i) => (
                    <span
                      key={i}
                      style={{
                        padding: "1px 5px",
                        border: "1px solid var(--vr-line)",
                        borderRadius: 2,
                        color: e > 0 ? "var(--vr-up)" : "var(--vr-down)",
                      }}
                    >
                      {e > 0 ? "+" : ""}
                      {e.toFixed(2)}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      {result.interpretation_summary ? (
        <div
          style={{
            padding: "10px 16px 14px",
            borderTop: "1px solid var(--vr-line)",
            fontSize: 12,
            fontFamily: "var(--ff-serif)",
            fontStyle: "italic",
            color: "var(--vr-cream-dim)",
            lineHeight: 1.55,
          }}
        >
          {result.interpretation_summary}
        </div>
      ) : null}
    </div>
  )
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "main" | "down"
}) {
  const color =
    tone === "main"
      ? value.startsWith("-")
        ? "var(--vr-down)"
        : "var(--vr-up)"
      : tone === "down"
        ? "var(--vr-down)"
        : "var(--vr-cream)"
  return (
    <div>
      <div style={{ fontSize: 9, color: "var(--vr-cream-mute)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 12, color, marginTop: 2 }}>{value}</div>
    </div>
  )
}
