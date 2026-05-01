// Server-rendered "truth panel" for a Lab run. Surfaces the four windows
// that operators have to keep straight to read a result honestly:
//
//   - Config window      — what the campaign was scheduled to evaluate
//   - Tradeable window   — when the strategy could actually trade (after
//                          fresh-tape guards, data-availability cuts, etc.)
//   - Trades executed    — counted at the swarm artifact, not the gate
//   - Leaderboard bench  — what the leaderboard's total_return_pct compares
//                          against. If this != tradeable window, we flag it.
//
// Without this panel, operators read "strategy -0.8% vs SPY +0.7%" and
// don't realize SPY had 5x more days to compound. The point isn't to
// scold the comparison, just to make the mismatch unmistakable.

import type {
  EquitySwarmV1,
  ResultEvaluationWindow,
} from "@/lib/research-lab-contracts"

interface RunAnatomyPanelProps {
  evaluationWindow: ResultEvaluationWindow | null | undefined
  swarm: EquitySwarmV1 | null
  /** Total benchmark days the leaderboard is comparing against. */
  leaderboardBenchmarkDays: number | null
}

function dayCount(curve: { date: string }[]): number {
  return curve.length
}

export function RunAnatomyPanel({
  evaluationWindow,
  swarm,
  leaderboardBenchmarkDays,
}: RunAnatomyPanelProps) {
  if (!evaluationWindow && !swarm) return null

  const tradeableStart = swarm?.date_range.start ?? null
  const tradeableEnd = swarm?.date_range.end ?? null
  const tradeableDays = swarm ? dayCount(swarm.strategy_curve) : null
  const tradeCount = swarm?.trades.length ?? null

  const configDays = evaluationWindow?.days ?? null
  const tradeableMismatch =
    configDays != null && tradeableDays != null && tradeableDays < configDays

  const benchMismatch =
    leaderboardBenchmarkDays != null &&
    tradeableDays != null &&
    leaderboardBenchmarkDays !== tradeableDays

  return (
    <section
      className="vr-card"
      style={{
        padding: "16px 18px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span
          className="t-eyebrow"
          style={{
            fontSize: 9,
            color: "var(--vr-gold)",
            letterSpacing: "0.14em",
          }}
        >
          Run anatomy
        </span>
        <span
          style={{
            fontFamily: "var(--ff-serif)",
            fontStyle: "italic",
            fontSize: 14,
            color: "var(--vr-cream-mute)",
          }}
        >
          what actually ran
        </span>
      </div>

      <dl
        style={{
          margin: 0,
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          rowGap: 10,
          columnGap: 16,
          alignItems: "baseline",
        }}
      >
        <Row
          label="Config window"
          value={
            evaluationWindow
              ? `${evaluationWindow.from} → ${evaluationWindow.to} · ${evaluationWindow.days} days`
              : "—"
          }
          hint="what the campaign was scheduled to evaluate"
        />
        <Row
          label="Tradeable window"
          value={
            tradeableStart && tradeableEnd && tradeableDays != null
              ? `${tradeableStart} → ${tradeableEnd} · ${tradeableDays} days`
              : "—"
          }
          hint={
            tradeableMismatch
              ? "the strategy could only trade this slice — fresh-tape guard or data availability cut the rest"
              : "when the strategy could actually trade"
          }
          chip={tradeableMismatch ? "narrowed" : null}
        />
        <Row
          label="Trades executed"
          value={tradeCount != null ? `${tradeCount}` : "—"}
          hint={
            tradeCount != null && tradeCount < 5
              ? "below the minimum for a decisive verdict"
              : null
          }
        />
        <Row
          label="Leaderboard benchmark"
          value={
            leaderboardBenchmarkDays != null
              ? `${leaderboardBenchmarkDays} days`
              : "—"
          }
          hint={
            benchMismatch
              ? "compared across the full config window, not the tradeable slice"
              : "matched to the tradeable window"
          }
          chip={benchMismatch ? "window mismatch" : null}
        />
      </dl>
    </section>
  )
}

function Row({
  label,
  value,
  hint,
  chip,
}: {
  label: string
  value: string
  hint?: string | null
  chip?: string | null
}) {
  return (
    <>
      <dt
        className="t-eyebrow"
        style={{
          fontSize: 9,
          color: "var(--vr-cream-mute)",
          letterSpacing: "0.12em",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </dt>
      <dd
        style={{
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: 3,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span
            className="t-mono"
            style={{
              fontSize: 12,
              color: "var(--vr-cream)",
              letterSpacing: "0.02em",
            }}
          >
            {value}
          </span>
          {chip && (
            <span
              className="t-eyebrow"
              style={{
                padding: "2px 7px",
                fontSize: 8.5,
                letterSpacing: "0.1em",
                borderRadius: 2,
                border: "1px solid var(--vr-gold-line)",
                background: "var(--vr-gold-soft)",
                color: "var(--vr-gold)",
                whiteSpace: "nowrap",
              }}
            >
              {chip}
            </span>
          )}
        </div>
        {hint && (
          <span
            style={{
              fontSize: 10.5,
              color: "var(--vr-cream-faint)",
              fontStyle: "italic",
              fontFamily: "var(--ff-serif)",
              lineHeight: 1.45,
            }}
          >
            {hint}
          </span>
        )}
      </dd>
    </>
  )
}
