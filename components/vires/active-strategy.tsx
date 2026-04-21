"use client"

// Active Strategy card — sits below SleeveSummary on every sleeve
// sub-screen. Collapsed: name + variant + status pill + chevron.
// Expanded inline (same card grows): selected passport summary, key
// metrics, regime timeline (active strategy only), other promoted
// variants for this sleeve.
//
// Per the design package: regime timeline lives here, not in
// AllocationHistory, because regime labels are strategy-specific.
//
// Data adaptation: design assumes a per-passport array on the feed.
// Production reads `operator.strategy_bank.active` + `banked_strategies`
// for stocks; `operator.crypto_signals.managed_exposure` for crypto;
// nothing for options (renders the empty-active state). Regime
// timeline reads `operator.allocation_history[sleeve].regimes` once
// Codex ships that field — until then, the timeline shows the
// "no regime history yet" placeholder per the design spec.

import { useState } from "react"
import Link from "next/link"
import type { Sleeve } from "./shared"

interface PerformanceSummary {
  total_return_pct?: number | null
  benchmark_return_pct?: number | null
  excess_return_pct?: number | null
  sharpe_ratio?: number | null
  max_drawdown_pct?: number | null
  calmar_ratio?: number | null
}

interface StrategyBankRecord {
  record_id?: string | null
  display_name?: string | null
  variant_id?: string | null
  strategy_family?: string | null
  description?: string | null
  promotion_stage?: string | null
  selected?: boolean | null
  performance_summary?: PerformanceSummary | null
}

interface ManagedExposureLite {
  manifest_id?: string | null
  title?: string | null
  strategy_family?: string | null
  status?: string | null
  current_state?: string | null
  current_exposure_pct?: number | null
  overlay_status?: string | null
  note?: string | null
  performance_summary?: PerformanceSummary | null
  ladder?: Array<{
    label?: string | null
    state?: string | null
    exposure_pct?: number | null
    note?: string | null
    active?: boolean | null
  }> | null
}

interface TacticalOverlayLite {
  status?: string | null
  bar?: string | null
  cadence?: string | null
  direction?: string | null
  last_cross_at?: string | null
  signal_strength_pct?: number | null
  signal_strength_label?: string | null
  note?: string | null
}

interface AllocationRegimeBand {
  from?: string | null
  to?: string | null
  label?: string | null
  tone?: string | null
}

interface AllocationHistorySleeve {
  status?: "available" | "unavailable" | string | null
  regimes?: AllocationRegimeBand[] | null
}

export interface ActiveStrategyOperator {
  strategy_bank?: {
    active?: StrategyBankRecord | null
    banked_strategies?: StrategyBankRecord[] | null
  } | null
  crypto_signals?: {
    managed_exposure?: ManagedExposureLite | null
    tsmom?: TacticalOverlayLite | null
  } | null
  allocation_history?: Record<string, AllocationHistorySleeve | null | undefined> | null
}

// ─── Normalized view (shared across stocks/crypto/options) ──────────────────

interface NormalizedStrategy {
  id: string
  name: string
  variant: string
  summary: string
  status: "LIVE" | "PAPER" | "PROMOTED" | "IDLE"
  metrics: {
    totalReturn: number | null
    excess: number | null
    sharpe: number | null
    maxDD: number | null
    calmar: number | null
  }
  benchmark: string | null
}

function statusFromStage(stage: string | null | undefined): NormalizedStrategy["status"] {
  if (!stage) return "IDLE"
  const s = stage.toUpperCase()
  if (s.includes("LIVE")) return "LIVE"
  if (s.includes("PAPER")) return "PAPER"
  if (s.includes("PROMOTED") || s.includes("FROZEN") || s.includes("CONFIRMATION")) return "PROMOTED"
  return "IDLE"
}

const STATUS_TONE: Record<NormalizedStrategy["status"], { color: string; label: string }> = {
  LIVE:     { color: "var(--vr-up)",         label: "Live" },
  PAPER:    { color: "var(--vr-gold)",       label: "Paper" },
  PROMOTED: { color: "var(--vr-gold)",       label: "Promoted" },
  IDLE:     { color: "var(--vr-cream-mute)", label: "Idle" },
}

// Humanize an enum / snake_case / colon-delimited identifier into a clean
// title-cased label. "regime_aware_momentum:stop_5_target_15" →
// "Regime Aware Momentum · Stop 5 Target 15"
function humanizeId(s: string | null | undefined): string {
  if (!s) return ""
  return s
    .split(/[:]+/)
    .map(seg => seg
      .split(/[_\s]+/)
      .filter(Boolean)
      .map(w => (w[0] ?? "").toUpperCase() + w.slice(1).toLowerCase())
      .join(" "))
    .filter(Boolean)
    .join(" · ")
}

function pickStrategyName(r: StrategyBankRecord): string {
  // Prefer the family name (cleaner) over display_name (which is
  // typically family:variant concatenated and underscore-noisy).
  if (r.strategy_family) return humanizeId(r.strategy_family)
  if (r.display_name) return humanizeId(r.display_name)
  return "Active strategy"
}

function normalizeStockRecord(r: StrategyBankRecord): NormalizedStrategy {
  return {
    id: r.record_id ?? r.display_name ?? "stock-strategy",
    name: pickStrategyName(r),
    variant: r.variant_id ? humanizeId(r.variant_id) : "",
    summary: r.description ?? "—",
    status: statusFromStage(r.promotion_stage),
    metrics: {
      totalReturn: r.performance_summary?.total_return_pct ?? null,
      excess:      r.performance_summary?.excess_return_pct ?? null,
      sharpe:      r.performance_summary?.sharpe_ratio ?? null,
      maxDD:       r.performance_summary?.max_drawdown_pct ?? null,
      calmar:      r.performance_summary?.calmar_ratio ?? null,
    },
    benchmark: r.performance_summary?.benchmark_return_pct != null ? "SPY" : null,
  }
}

function normalizeManagedExposure(m: ManagedExposureLite): NormalizedStrategy {
  return {
    id: m.manifest_id ?? "crypto-managed-exposure",
    name: m.title ?? "BTC Managed Exposure",
    variant: m.strategy_family ? humanizeId(m.strategy_family) : "Graduated core",
    summary: m.note ?? "Daily graduated core exposure. Tactical overlay sits as a research-only candidate.",
    status: m.status === "PROMOTED" ? "PROMOTED" : "IDLE",
    metrics: {
      totalReturn: m.performance_summary?.total_return_pct ?? null,
      excess:      m.performance_summary?.excess_return_pct ?? null,
      sharpe:      m.performance_summary?.sharpe_ratio ?? null,
      maxDD:       m.performance_summary?.max_drawdown_pct ?? null,
      calmar:      m.performance_summary?.calmar_ratio ?? null,
    },
    benchmark: m.performance_summary?.benchmark_return_pct != null ? "BTC" : null,
  }
}

function pickActiveSet(
  sleeve: Sleeve,
  operator: ActiveStrategyOperator | null | undefined,
): { active: NormalizedStrategy | null; others: NormalizedStrategy[]; passportHref: string | null } {
  if (sleeve === "stocks") {
    const active = operator?.strategy_bank?.active ?? null
    const banked = operator?.strategy_bank?.banked_strategies ?? []
    const activeView = active ? normalizeStockRecord(active) : null
    const others = banked
      .filter(b => b.selected !== true && b.record_id !== active?.record_id)
      .map(normalizeStockRecord)
    return {
      active: activeView,
      others,
      passportHref: activeView ? `/vires/passport/${encodeURIComponent(activeView.id)}` : null,
    }
  }
  if (sleeve === "crypto") {
    const m = operator?.crypto_signals?.managed_exposure ?? null
    const activeView = m ? normalizeManagedExposure(m) : null
    return {
      active: activeView,
      others: [],
      passportHref: null,
    }
  }
  return { active: null, others: [], passportHref: null }
}

// ─── Regime timeline ────────────────────────────────────────────────────────

function fmtBand(d: string | null | undefined): string {
  if (!d) return ""
  try {
    const dt = new Date(`${d}T00:00:00`)
    return dt.toLocaleString("en-US", { month: "short", day: "numeric" }).toUpperCase()
  } catch {
    return ""
  }
}

function daysBetween(from: string | null | undefined, to: string | null | undefined): number {
  if (!from || !to) return 1
  const a = new Date(`${from}T00:00:00`).getTime()
  const b = new Date(`${to}T00:00:00`).getTime()
  return Math.max(1, Math.round((b - a) / 86400000))
}

function StrategyRegimeTimeline({
  sleeve,
  operator,
}: {
  sleeve: Sleeve
  operator?: ActiveStrategyOperator | null
}) {
  const data = operator?.allocation_history?.[sleeve] ?? null
  const regimes = data?.regimes ?? []
  if (!data || data.status !== "available" || regimes.length === 0) {
    return (
      <div style={{
        padding: "12px 14px",
        background: "rgba(95, 106, 122, 0.08)",
        border: "1px solid var(--vr-line)",
        borderRadius: 2,
        fontFamily: "var(--ff-mono)",
        fontSize: 10,
        color: "var(--vr-cream-faint)",
        letterSpacing: "0.06em",
        lineHeight: 1.55,
      }}>
        No regime history yet. Timeline appears after first regime flip.
      </div>
    )
  }
  const reversed = regimes.slice().reverse()
  return (
    <div>
      {reversed.map((b, i) => {
        const isCurrent = i === 0
        const days = daysBetween(b.from, b.to)
        return (
          <div key={`${b.from ?? i}-${b.label ?? "band"}`} style={{
            display: "grid",
            gridTemplateColumns: "12px 48px 1fr auto",
            alignItems: "baseline",
            gap: 10,
            padding: "8px 0",
            borderTop: i === 0 ? "none" : "1px solid rgba(241, 236, 224, 0.04)",
            position: "relative",
          }}>
            <div style={{ position: "relative", height: 12, display: "flex", alignItems: "center" }}>
              <span style={{
                width: 7, height: 7, borderRadius: "50%",
                background: isCurrent ? "var(--vr-gold)" : "transparent",
                border: isCurrent ? "none" : "1px solid var(--vr-cream-faint)",
                boxShadow: isCurrent ? "0 0 8px rgba(200, 169, 104, 0.55)" : "none",
              }} />
              {i < reversed.length - 1 && (
                <span style={{
                  position: "absolute", top: 16, left: 3, width: 1, height: 22,
                  background: "var(--vr-line)",
                }} />
              )}
            </div>
            <div style={{
              fontFamily: "var(--ff-mono)", fontSize: 9.5,
              color: "var(--vr-cream-faint)", letterSpacing: "0.1em",
            }}>
              {fmtBand(b.from)}
            </div>
            <div>
              <div style={{
                fontFamily: "var(--ff-sans)", fontSize: 12,
                color: isCurrent ? "var(--vr-cream)" : "var(--vr-cream-dim)",
                fontWeight: isCurrent ? 500 : 400,
              }}>
                {isCurrent ? "Entered " : ""}{b.label ?? "—"}
                {isCurrent && (
                  <span style={{
                    fontFamily: "var(--ff-mono)", fontSize: 8.5, letterSpacing: "0.22em",
                    color: "var(--vr-gold)", marginLeft: 8, padding: "1px 5px",
                    border: "1px solid rgba(200, 169, 104, 0.3)", borderRadius: 2,
                    textTransform: "uppercase",
                  }}>Current</span>
                )}
              </div>
            </div>
            <div style={{
              fontFamily: "var(--ff-mono)", fontSize: 9.5,
              color: "var(--vr-cream-mute)", letterSpacing: "0.08em",
            }}>
              {isCurrent ? `${days}D ONGOING` : `${days}D`}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Header (always visible) ────────────────────────────────────────────────

function ActiveStrategyHeader({
  active,
  open,
  onToggle,
}: {
  active: NormalizedStrategy | null
  open: boolean
  onToggle: () => void
}) {
  if (!active) {
    return (
      <button onClick={onToggle} style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        width: "100%", padding: "12px 14px", background: "transparent",
        border: "none", textAlign: "left", cursor: "pointer",
      }}>
        <div>
          <div style={{
            fontFamily: "var(--ff-mono)", fontSize: 9, letterSpacing: "0.22em",
            color: "var(--vr-cream-faint)", textTransform: "uppercase", marginBottom: 3,
          }}>
            Active Strategy
          </div>
          <div style={{ fontFamily: "var(--ff-sans)", fontSize: 12, color: "var(--vr-cream-dim)" }}>
            None deployed — awaiting promotion
          </div>
        </div>
        <span style={{
          color: "var(--vr-cream-faint)", fontSize: 11,
          transform: open ? "rotate(90deg)" : "rotate(0deg)",
          transition: "transform 160ms ease",
          display: "inline-block",
        }}>›</span>
      </button>
    )
  }
  const tone = STATUS_TONE[active.status]
  return (
    <button onClick={onToggle} style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      width: "100%", padding: "12px 14px", background: "transparent",
      border: "none", textAlign: "left", cursor: "pointer",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{
            fontFamily: "var(--ff-mono)", fontSize: 9, letterSpacing: "0.22em",
            color: "var(--vr-cream-faint)", textTransform: "uppercase",
          }}>
            Active Strategy
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: tone.color }} />
            <span style={{
              fontFamily: "var(--ff-sans)", fontSize: 9.5, color: tone.color,
              letterSpacing: "0.08em",
            }}>{tone.label}</span>
          </span>
        </div>
        <div style={{
          fontFamily: "var(--ff-display)", fontSize: 17, color: "var(--vr-cream)",
          fontWeight: 400, letterSpacing: "-0.01em", lineHeight: 1.2,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {active.name}
        </div>
        {active.variant && (
          <div style={{
            fontFamily: "var(--ff-mono)", fontSize: 9.5, color: "var(--vr-cream-mute)",
            letterSpacing: "0.06em", marginTop: 1,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {active.variant}
          </div>
        )}
      </div>
      <span style={{
        color: "var(--vr-cream-faint)", fontSize: 14, marginLeft: 10,
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 180ms ease",
        display: "inline-block",
      }}>›</span>
    </button>
  )
}

// ─── Crypto strategy details (folded in from former CryptoExposure +
// CryptoTSMOM sibling cards). Shown inside ActiveStrategyBody when
// sleeve === "crypto" and the active variant is selected. Renders the
// managed-exposure tier ladder and the tactical 4H overlay status.
// Both are strategy-specific signals — they belong attached to the
// strategy card, not floating as separate sleeve cards.

function CryptoStrategyDetails({ operator }: { operator?: ActiveStrategyOperator | null }) {
  const exposure = operator?.crypto_signals?.managed_exposure ?? null
  const tsmom = operator?.crypto_signals?.tsmom ?? null
  const ladder = exposure?.ladder ?? []
  const currentExposure = exposure?.current_exposure_pct
  const currentState = exposure?.current_state
  const overlayStatus = tsmom?.status
  const overlayLabel =
    overlayStatus === "PROMOTED" ? "Promoted"
    : overlayStatus === "RESEARCH_ONLY" ? "Research only"
    : overlayStatus ? overlayStatus.toLowerCase().replace(/_/g, " ") : "Awaiting"
  const overlayTone =
    overlayStatus === "PROMOTED" ? "var(--vr-up)"
    : overlayStatus === "RESEARCH_ONLY" ? "var(--vr-gold)"
    : "var(--vr-cream-mute)"

  const hasLadder = ladder.length > 0
  const hasOverlay = tsmom != null
  if (!hasLadder && !hasOverlay) return null

  return (
    <div style={{ marginBottom: 12 }}>
      {hasLadder && (
        <div style={{ marginBottom: hasOverlay ? 14 : 0 }}>
          <div style={{
            display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8,
          }}>
            <div className="t-eyebrow">Managed Exposure</div>
            {currentExposure != null && (
              <div style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
                <span className="t-num" style={{
                  fontSize: 14, color: "var(--vr-cream)", fontWeight: 500,
                }}>
                  {currentExposure.toFixed(0)}%
                </span>
                {currentState && (
                  <span style={{
                    fontFamily: "var(--ff-sans)", fontSize: 9.5,
                    color: "var(--vr-cream-mute)", letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}>
                    {currentState.replace(/_/g, " ")}
                  </span>
                )}
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {ladder.map(t => (
              <div
                key={t.label ?? "tier"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "7px 10px",
                  background: "transparent",
                  border: `1px solid ${t.active ? "var(--vr-gold-line)" : "var(--vr-line)"}`,
                  borderRadius: 2,
                }}
              >
                <span style={{
                  width: 5, height: 5, borderRadius: "50%",
                  background: t.active ? "var(--vr-gold)" : "var(--vr-cream-faint)",
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span className="t-eyebrow" style={{ fontSize: 9.5 }}>{t.label}</span>
                    {t.note && (
                      <span className="t-label" style={{ fontSize: 10 }}>{t.note}</span>
                    )}
                  </div>
                </div>
                <span className="t-num" style={{
                  fontSize: 12,
                  color: t.active ? "var(--vr-cream)" : "var(--vr-cream-mute)",
                }}>
                  {t.exposure_pct != null ? `${t.exposure_pct}%` : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasOverlay && (
        <div>
          <div style={{
            display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8,
          }}>
            <div className="t-eyebrow">Tactical Overlay · {tsmom?.cadence ?? tsmom?.bar ?? "4H"} TSMOM</div>
            <span style={{
              fontFamily: "var(--ff-sans)", fontSize: 9.5,
              color: overlayTone, letterSpacing: "0.08em", textTransform: "uppercase",
            }}>
              {overlayLabel}
            </span>
          </div>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
            border: "1px solid var(--vr-line)", borderRadius: 2,
          }}>
            <div style={{ padding: "10px 12px" }}>
              <div className="t-eyebrow" style={{ fontSize: 8.5, marginBottom: 4 }}>Direction</div>
              <div className="t-num" style={{
                fontSize: 12,
                color: tsmom?.direction ? "var(--vr-cream)" : "var(--vr-cream-mute)",
              }}>
                {tsmom?.direction ?? "—"}
              </div>
            </div>
            <div style={{
              padding: "10px 12px", borderLeft: "1px solid var(--vr-line)",
            }}>
              <div className="t-eyebrow" style={{ fontSize: 8.5, marginBottom: 4 }}>Signal</div>
              <div className="t-num" style={{
                fontSize: 12,
                color: tsmom?.signal_strength_pct != null ? "var(--vr-cream)" : "var(--vr-cream-mute)",
              }}>
                {tsmom?.signal_strength_pct != null
                  ? `${tsmom.signal_strength_pct.toFixed(0)}%`
                  : (tsmom?.signal_strength_label ?? "—")}
              </div>
            </div>
            <div style={{
              padding: "10px 12px", borderLeft: "1px solid var(--vr-line)",
            }}>
              <div className="t-eyebrow" style={{ fontSize: 8.5, marginBottom: 4 }}>Last Cross</div>
              <div className="t-num" style={{
                fontSize: 11,
                color: tsmom?.last_cross_at ? "var(--vr-cream)" : "var(--vr-cream-mute)",
              }}>
                {tsmom?.last_cross_at ? tsmom.last_cross_at.replace("T", " ").slice(0, 16) : "—"}
              </div>
            </div>
          </div>
          {tsmom?.note && (
            <div className="t-label" style={{
              fontSize: 10, marginTop: 8, lineHeight: 1.45,
              color: "var(--vr-cream-mute)",
            }}>
              {tsmom.note}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Body (expanded inline) ─────────────────────────────────────────────────

function ActiveStrategyBody({
  sleeve,
  active,
  others,
  passportHref,
  operator,
}: {
  sleeve: Sleeve
  active: NormalizedStrategy | null
  others: NormalizedStrategy[]
  passportHref: string | null
  operator?: ActiveStrategyOperator | null
}) {
  const [pickedId, setPickedId] = useState<string | null>(active?.id ?? null)

  if (!active) {
    return (
      <div style={{
        padding: "0 14px 14px",
        fontFamily: "var(--ff-sans)", fontSize: 11.5,
        color: "var(--vr-cream-dim)", lineHeight: 1.55,
      }}>
        Nothing is running this sleeve yet. Strategies earn their way here by
        passing the bench, surviving the paper window, and getting promoted.
      </div>
    )
  }

  const candidates = [active, ...others]
  const picked = candidates.find(p => p.id === pickedId) ?? active
  const isActiveSelected = picked.id === active.id
  const tone = STATUS_TONE[picked.status]
  const fmtPct = (n: number | null, decimals = 1): string =>
    n == null ? "—" : `${n >= 0 && decimals === 1 ? "" : ""}${n.toFixed(decimals)}%`
  const fmtDelta = (n: number | null, decimals = 1): string => {
    if (n == null) return "—"
    return `${n >= 0 ? "+" : ""}${n.toFixed(decimals)}%`
  }
  const fmtNum = (n: number | null, decimals = 2): string =>
    n == null ? "—" : n.toFixed(decimals)

  return (
    <div style={{ padding: "4px 14px 14px" }}>
      {/* Selected passport summary */}
      <div style={{
        background: "var(--vr-ink-sunken)",
        border: "1px solid var(--vr-line)",
        borderRadius: 3,
        padding: "12px 12px 10px",
        marginBottom: 12,
      }}>
        {!isActiveSelected && (
          <div style={{ marginBottom: 6 }}>
            <span style={{
              fontFamily: "var(--ff-mono)", fontSize: 8.5, letterSpacing: "0.22em",
              color: "var(--vr-cream-mute)", padding: "1px 5px",
              border: "1px solid var(--vr-line)", borderRadius: 2,
            }}>PREVIEW</span>
          </div>
        )}
        <div style={{
          fontFamily: "var(--ff-sans)", fontSize: 11.5,
          color: "var(--vr-cream-dim)", lineHeight: 1.5, letterSpacing: "0.01em",
        }}>
          {picked.summary}
        </div>

        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10,
          marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--vr-line)",
        }}>
          {[
            {
              k: "Return",
              v: fmtPct(picked.metrics.totalReturn),
              sub: picked.benchmark
                ? `vs ${picked.benchmark} ${fmtDelta(picked.metrics.excess)}`
                : (picked.metrics.excess != null ? `excess ${fmtDelta(picked.metrics.excess)}` : "—"),
            },
            {
              k: "Sharpe",
              v: fmtNum(picked.metrics.sharpe),
              sub: picked.metrics.calmar != null ? `Calmar ${fmtNum(picked.metrics.calmar)}` : "—",
            },
            {
              k: "Max DD",
              v: fmtPct(picked.metrics.maxDD),
              sub: tone.label.toLowerCase(),
            },
          ].map(m => (
            <div key={m.k}>
              <div style={{
                fontFamily: "var(--ff-mono)", fontSize: 8.5, letterSpacing: "0.18em",
                color: "var(--vr-cream-faint)", textTransform: "uppercase", marginBottom: 2,
              }}>{m.k}</div>
              <div style={{
                fontFamily: "var(--ff-display)", fontSize: 16, color: "var(--vr-cream)",
                letterSpacing: "-0.01em", lineHeight: 1.1,
              }}>{m.v}</div>
              <div style={{
                fontFamily: "var(--ff-mono)", fontSize: 9, color: "var(--vr-cream-mute)",
                letterSpacing: "0.05em", marginTop: 1,
              }}>{m.sub}</div>
            </div>
          ))}
        </div>

        {passportHref && isActiveSelected && (
          <Link href={passportHref} style={{
            display: "block", width: "100%", marginTop: 12, padding: "7px 10px",
            background: "transparent", border: "1px solid rgba(200, 169, 104, 0.25)",
            borderRadius: 2, color: "var(--vr-gold)",
            fontFamily: "var(--ff-sans)", fontSize: 10, letterSpacing: "0.2em",
            textTransform: "uppercase", cursor: "pointer", textAlign: "center",
            textDecoration: "none",
          }}>
            Open full passport →
          </Link>
        )}
      </div>

      {/* Crypto-specific strategy state — tier ladder + tactical overlay.
          Lives here (instead of as sibling cards) because both are tied
          to whichever strategy is actively running this sleeve. Per
          Jacob's 2026-04-20 walkthrough. */}
      {isActiveSelected && sleeve === "crypto" && (
        <CryptoStrategyDetails operator={operator} />
      )}

      {/* Regime timeline — only for the active (not preview) */}
      {isActiveSelected && (
        <div style={{ marginBottom: 12 }}>
          <div className="t-eyebrow" style={{ marginBottom: 8 }}>Regime Timeline</div>
          <StrategyRegimeTimeline sleeve={sleeve} operator={operator} />
          <div style={{
            fontSize: 10, color: "var(--vr-cream-faint)",
            lineHeight: 1.5, marginTop: 6,
          }}>
            Regime labels belong to this strategy. Swap the strategy and the history stays tied to it.
          </div>
        </div>
      )}

      {/* Other promoted variants */}
      <div>
        <div className="t-eyebrow" style={{ marginBottom: 8 }}>
          Other promoted {others.length === 1 ? "variant" : "variants"}
        </div>
        {others.length > 0 ? (
          others.map(p => {
            const t = STATUS_TONE[p.status]
            const isPicked = pickedId === p.id
            return (
              <button
                key={p.id}
                onClick={() => setPickedId(p.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  width: "100%", padding: "9px 10px",
                  background: isPicked ? "rgba(200, 169, 104, 0.08)" : "transparent",
                  border: `1px solid ${isPicked ? "rgba(200, 169, 104, 0.35)" : "var(--vr-line)"}`,
                  borderRadius: 3, marginBottom: 6,
                  cursor: "pointer", textAlign: "left",
                }}
              >
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: t.color }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--ff-sans)", fontSize: 12, color: "var(--vr-cream)" }}>
                    {p.name}
                  </div>
                  {p.variant && (
                    <div style={{
                      fontFamily: "var(--ff-mono)", fontSize: 9.5, color: "var(--vr-cream-mute)",
                      letterSpacing: "0.05em", marginTop: 1,
                    }}>{p.variant}</div>
                  )}
                </div>
                <div style={{
                  fontFamily: "var(--ff-mono)", fontSize: 10, color: "var(--vr-cream-mute)",
                  letterSpacing: "0.05em",
                }}>
                  {p.metrics.totalReturn != null ? `${p.metrics.totalReturn.toFixed(0)}%` : "—"}
                </div>
              </button>
            )
          })
        ) : (
          <div style={{
            padding: "10px 12px",
            background: "rgba(95, 106, 122, 0.06)",
            border: "1px solid var(--vr-line)",
            borderRadius: 2,
            fontSize: 11, color: "var(--vr-cream-mute)", lineHeight: 1.55,
          }}>
            No other promoted variants yet. When the bench promotes another, it will appear here.
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Public component ──────────────────────────────────────────────────────

export function ActiveStrategy({
  sleeve,
  operator,
}: {
  sleeve: Sleeve
  operator?: ActiveStrategyOperator | null
}) {
  const [open, setOpen] = useState(false)
  const { active, others, passportHref } = pickActiveSet(sleeve, operator)

  return (
    <div className="vr-card" style={{
      padding: 0,
      overflow: "hidden",
      border: `1px solid ${open ? "var(--vr-line-hi)" : "var(--vr-line)"}`,
      transition: "border-color 160ms ease",
    }}>
      <ActiveStrategyHeader
        active={active}
        open={open}
        onToggle={() => setOpen(o => !o)}
      />
      {open && (
        <div style={{ borderTop: "1px solid var(--vr-line)" }}>
          <ActiveStrategyBody
            sleeve={sleeve}
            active={active}
            others={others}
            passportHref={passportHref}
            operator={operator}
          />
        </div>
      )}
    </div>
  )
}
