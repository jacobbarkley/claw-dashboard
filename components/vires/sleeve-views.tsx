"use client"

// Per-sleeve views (Stocks / Options / Crypto) for the Vires Trading section.
// Each sleeve gets a SleeveSummary header + Open Positions list. Stocks adds
// a Qualified Universe panel; Options shows an "awaiting promotion" state;
// Crypto adds the two-layer architecture explainer kept compact and the
// position list. Future BTC TSMOM / exposure ladder cards will plug in once
// Codex ships the crypto signal data in the operator feed.

import { Delta, StatusPill, fmtCurrency, fmtPct, toneColor, toneOf, type Sleeve } from "./shared"
import type { ViresTradingData } from "./trading-home"

interface ViresPosition {
  symbol: string
  qty: number
  entry_price: number
  current_price: number
  market_value: number
  unrealized_pnl: number
  unrealized_pct: number | null
  change_today_pct: number
  asset_type?: string
}

interface ViresStrategyUniverse {
  symbols: Array<{
    symbol: string
    current_price: number | null
    change_pct: number | null
    in_position: boolean
    position_qty: number
    strategy_member?: boolean
    return_20d_pct?: number | null  // Codex primer ask — optional until shipped
  }>
}

interface StrategyRules {
  stop_loss_pct: number | null
  target_pct: number | null
}

interface CryptoSignalTSMOM {
  status?: string | null
  bar?: string | null
  direction?: string | null
  last_cross_at?: string | null
  signal_strength_pct?: number | null
  signal_strength_label?: string | null
  note?: string | null
}

interface CryptoManagedExposureSignal {
  status?: string | null
  title?: string | null
  current_state?: string | null
  current_exposure_pct?: number | null
  overlay_status?: string | null
  note?: string | null
  performance_summary?: {
    total_return_pct?: number | null
    max_drawdown_pct?: number | null
    calmar_ratio?: number | null
    excess_return_pct?: number | null
  } | null
  ladder?: Array<{
    label?: string | null
    exposure_pct?: number | null
    note?: string | null
    active?: boolean | null
  }>
}

interface CryptoTrackedAssetSignal {
  symbol?: string | null
  lane?: string | null
  tier_label?: string | null
  target_exposure_pct?: number | null
  state?: string | null
}

interface CryptoSignalsBlock {
  tsmom?: CryptoSignalTSMOM | null
  managed_exposure?: CryptoManagedExposureSignal | null
  tracked_assets?: CryptoTrackedAssetSignal[]
}

interface CryptoSignalsOperator {
  crypto_signals?: CryptoSignalsBlock | null
}

// ─── Sleeve hero ────────────────────────────────────────────────────────────

function SleeveSummary({ sleeve, positions }: { sleeve: Sleeve; positions: ViresPosition[] }) {
  const cfg = {
    stocks:  { c: "var(--vr-sleeve-stocks)",  title: "Stocks",  copy: "Equity sleeve · regime-aware momentum" },
    options: { c: "var(--vr-sleeve-options)", title: "Options", copy: "Premium sleeve · awaiting promotion" },
    crypto:  { c: "var(--vr-sleeve-crypto)",  title: "Crypto",  copy: "Digital asset sleeve · two-layer" },
  }[sleeve]

  const total = positions.reduce((s, p) => s + (p.market_value ?? 0), 0)
  // Today's $ change: per-position market_value × pct/(100+pct) so the sleeve
  // total reads cleanly even when sizes vary across symbols.
  const todayUsd = positions.reduce((s, p) => {
    const pct = p.change_today_pct ?? 0
    if (!pct) return s
    return s + (p.market_value ?? 0) * (pct / (100 + pct))
  }, 0)
  const todayPct = total > 0 ? (todayUsd / (total - todayUsd)) * 100 : null
  const upnl = positions.reduce((s, p) => s + (p.unrealized_pnl ?? 0), 0)

  return (
    <div className="vr-card-hero" style={{ padding: 22, borderColor: `${cfg.c}33` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ width: 5, height: 5, background: cfg.c, display: "inline-block" }} />
        <span className="t-eyebrow" style={{ color: cfg.c }}>{cfg.title}</span>
      </div>
      <div className="t-display t-num" style={{ fontSize: 36 }}>
        {total === 0 ? "—" : fmtCurrency(total)}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        {total > 0 ? (
          <>
            {todayPct != null && <Delta value={todayPct} size="12px" />}
            <span className="t-label" style={{ fontSize: 11 }}>today</span>
            <span style={{ color: "var(--vr-cream-faint)" }}>·</span>
            <span className="t-num" style={{ fontSize: 12, color: toneColor(toneOf(upnl)) }}>
              {fmtCurrency(upnl, { sign: true })}
            </span>
            <span className="t-label" style={{ fontSize: 11 }}>unrealized</span>
          </>
        ) : (
          <span className="t-label">{cfg.copy}</span>
        )}
      </div>
    </div>
  )
}

// ─── Position row ───────────────────────────────────────────────────────────

function PositionRow({ p }: { p: ViresPosition }) {
  const tone = toneOf(p.change_today_pct)
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto auto",
        gap: 12,
        padding: "14px 16px",
        alignItems: "center",
      }}
    >
      <div>
        <div className="t-ticker" style={{ fontSize: 13 }}>{p.symbol}</div>
        <div className="t-label" style={{ fontSize: 11, marginTop: 2 }}>
          {p.qty.toLocaleString("en-US", { maximumFractionDigits: 8 })} @ {fmtCurrency(p.entry_price)}
        </div>
      </div>
      <div className="t-num" style={{ fontSize: 13, color: "var(--vr-cream)", textAlign: "right" }}>
        {fmtCurrency(p.market_value)}
      </div>
      <div style={{ textAlign: "right", minWidth: 76 }}>
        <div className="t-num" style={{ fontSize: 12, color: toneColor(tone) }}>
          {p.change_today_pct >= 0 ? "+" : ""}{fmtPct(p.change_today_pct)}
        </div>
        <div className="t-num" style={{ fontSize: 10, color: toneColor(toneOf(p.unrealized_pnl)), marginTop: 2 }}>
          {fmtCurrency(p.unrealized_pnl, { sign: true })}
        </div>
      </div>
    </div>
  )
}

// ─── Open Positions card ────────────────────────────────────────────────────

function OpenPositions({ positions }: { positions: ViresPosition[] }) {
  if (positions.length === 0) {
    return (
      <div className="vr-card" style={{ padding: "20px 18px" }}>
        <div className="t-eyebrow" style={{ marginBottom: 6 }}>Open Positions</div>
        <div className="t-h4" style={{ color: "var(--vr-cream-dim)" }}>None</div>
        <div className="t-label" style={{ fontSize: 11, marginTop: 4 }}>
          Sleeve idle pending strategy promotion from Bench.
        </div>
      </div>
    )
  }
  return (
    <div className="vr-card">
      <div style={{ padding: "14px 16px 10px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div className="t-eyebrow">Open Positions</div>
        <span className="t-label" style={{ fontSize: 10, color: "var(--vr-cream-mute)" }}>
          {positions.length} active
        </span>
      </div>
      <div className="vr-divide" style={{ borderTop: "1px solid var(--vr-line)" }}>
        {positions.map(p => <PositionRow key={p.symbol} p={p} />)}
      </div>
    </div>
  )
}

// ─── Strategy Universe panel (Stocks) ───────────────────────────────────────

function StrategyUniverse({ universe, positions, rules }: {
  universe: ViresStrategyUniverse | null
  positions: ViresPosition[]
  rules: StrategyRules
}) {
  if (!universe || universe.symbols.length === 0) return null
  const sorted = [...universe.symbols].sort((a, b) => {
    if (a.in_position !== b.in_position) return a.in_position ? -1 : 1
    return (b.change_pct ?? 0) - (a.change_pct ?? 0)
  })
  const heldCount = sorted.filter(s => s.in_position).length
  const positionBySymbol = new Map(positions.map(p => [p.symbol, p]))

  return (
    <div className="vr-card">
      <div style={{ padding: "14px 16px 10px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div className="t-eyebrow">Qualified Universe</div>
        <span className="t-label" style={{ fontSize: 10, color: "var(--vr-cream-mute)" }}>
          {heldCount} held · {sorted.length} tracked
        </span>
      </div>
      <div className="vr-divide" style={{ borderTop: "1px solid var(--vr-line)" }}>
        {sorted.map(s => {
          const pos = positionBySymbol.get(s.symbol)
          const held = s.in_position && !!pos
          const strategyMember = s.strategy_member !== false
          const managedByStrategy = held && strategyMember
          const tone = toneOf(s.change_pct)
          // For held rows: show stop / target prices derived from entry
          // price and the active strategy's rule set. For non-held rows:
          // show last price + today's change (+ 20d return when Codex
          // ships the field — empty until then).
          const stopPrice = managedByStrategy && rules.stop_loss_pct != null && pos!.entry_price > 0
            ? pos!.entry_price * (1 - rules.stop_loss_pct / 100)
            : null
          const targetPrice = managedByStrategy && rules.target_pct != null && pos!.entry_price > 0
            ? pos!.entry_price * (1 + rules.target_pct / 100)
            : null

          return (
            <div
              key={s.symbol}
              style={{ padding: "12px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                  <span className="t-ticker" style={{ fontSize: 13 }}>{s.symbol}</span>
                  {held ? (
                    <span
                      className="t-eyebrow"
                      style={{
                        fontSize: 9,
                        padding: "2px 6px",
                        background: "var(--vr-up-soft)",
                        color: "var(--vr-up)",
                        border: "1px solid var(--vr-up)22",
                        borderRadius: 2,
                      }}
                    >
                      {managedByStrategy ? "Momentum long" : "Held outside active sleeve"} · {s.position_qty.toLocaleString("en-US", { maximumFractionDigits: 4 })}
                    </span>
                  ) : (
                    <span className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-cream-mute)" }}>
                      Universe
                    </span>
                  )}
                </div>
                <div className="t-label" style={{ fontSize: 11, lineHeight: 1.45 }}>
                  {held
                    ? managedByStrategy
                      ? `Entry $${pos!.entry_price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · qty ${s.position_qty}`
                      : "Held in broker account but not part of the active stock sleeve."
                    : s.return_20d_pct != null
                      ? `20-day return ${s.return_20d_pct >= 0 ? "+" : ""}${s.return_20d_pct.toFixed(2)}%`
                      : "Monitored · 20-day return pending feed"}
                </div>
              </div>
              <div style={{ textAlign: "right", minWidth: 88 }}>
                {held && stopPrice != null && targetPrice != null ? (
                  <>
                    <div className="t-num" style={{ fontSize: 10, color: "var(--vr-down)" }}>
                      SL {fmtCurrency(stopPrice)}
                    </div>
                    <div className="t-num" style={{ fontSize: 10, color: "var(--vr-up)", marginTop: 2 }}>
                      TP {fmtCurrency(targetPrice)}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="t-num" style={{ fontSize: 11, color: "var(--vr-cream)" }}>
                      {s.current_price != null ? fmtCurrency(s.current_price) : "—"}
                    </div>
                    <div className="t-num" style={{ fontSize: 10, color: toneColor(tone), marginTop: 2 }}>
                      {s.change_pct != null ? `${s.change_pct >= 0 ? "+" : ""}${fmtPct(s.change_pct)}` : ""}
                    </div>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Crypto explainer (compact two-layer) ───────────────────────────────────

function CryptoArchitecture({ signals }: { signals?: CryptoManagedExposureSignal | null }) {
  const perf = signals?.performance_summary ?? null
  const totalReturn = perf?.total_return_pct
  const maxDrawdown = perf?.max_drawdown_pct
  const calmar = perf?.calmar_ratio
  const summaryLine =
    totalReturn != null || maxDrawdown != null || calmar != null
      ? [
          totalReturn != null ? `${totalReturn >= 0 ? "+" : ""}${totalReturn.toFixed(0)}% net` : null,
          maxDrawdown != null ? `max DD ${maxDrawdown.toFixed(0)}%` : null,
          calmar != null ? `Calmar ${calmar.toFixed(2)}` : null,
        ].filter(Boolean).join(" · ")
      : null
  return (
    <div className="vr-card" style={{ padding: 18 }}>
      <div className="t-eyebrow" style={{ marginBottom: 10 }}>Two-layer architecture</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11, color: "var(--vr-cream-dim)" }}>
        <div style={{ flex: 1 }}>
          <div className="t-eyebrow" style={{ fontSize: 9, color: "var(--vr-gold)" }}>Core regime</div>
          <div style={{ marginTop: 4 }}>Daily · own BTC?</div>
        </div>
        <span style={{ color: "var(--vr-cream-faint)" }}>→</span>
        <div style={{ flex: 1 }}>
          <div className="t-eyebrow" style={{ fontSize: 9 }}>Tactical overlay</div>
          <div style={{ marginTop: 4 }}>4H · trim or add inside the regime</div>
        </div>
      </div>
      <div className="t-label" style={{ fontSize: 10, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--vr-line)" }}>
        {summaryLine ?? signals?.note ?? "Managed BTC exposure promotes the core sleeve first and leaves tactical as an overlay candidate."}
      </div>
    </div>
  )
}

// ─── BTC 4H TSMOM signal card (scaffolded) ──────────────────────────────────
// Fully laid out per the design handoff. Values default to em-dashes until
// Codex's crypto_signals.tsmom block populates the operator feed (primer
// ask #7).
function CryptoTSMOM({ signals }: { signals?: CryptoSignalTSMOM | null }) {
  const status = signals?.status ?? "AWAITING_FEED"
  const statusLabel =
    status === "RESEARCH_ONLY" ? "BENCH ONLY"
    : status === "PROMOTED" ? "PROMOTED"
    : "AWAITING FEED"
  const signalStrength = signals?.signal_strength_pct
  const signalTone = signalStrength != null && signalStrength >= 60 ? "gold" : "neutral"
  return (
    <div className="vr-card" style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 4 }}>BTC 4H TSMOM</div>
          <div className="t-h3" style={{ fontSize: 16 }}>Time-Series Momentum</div>
        </div>
        <StatusPill tone={signalTone}>{statusLabel}</StatusPill>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0, borderTop: "1px solid var(--vr-line)" }}>
        <div style={{ padding: "12px 0 4px", paddingRight: 12 }}>
          <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 4 }}>Bar</div>
          <div className="t-num" style={{ fontSize: 14, color: signals?.bar ? "var(--vr-cream)" : "var(--vr-cream-mute)" }}>{signals?.bar ?? "—"}</div>
        </div>
        <div style={{ padding: "12px 12px 4px", borderLeft: "1px solid var(--vr-line)" }}>
          <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 4 }}>Direction</div>
          <div className="t-num" style={{ fontSize: 14, color: signals?.direction ? "var(--vr-cream)" : "var(--vr-cream-mute)" }}>{signals?.direction ?? "—"}</div>
        </div>
        <div style={{ padding: "12px 0 4px 12px", borderLeft: "1px solid var(--vr-line)" }}>
          <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 4 }}>Last Cross</div>
          <div className="t-num" style={{ fontSize: 11, color: signals?.last_cross_at ? "var(--vr-cream)" : "var(--vr-cream-mute)" }}>
            {signals?.last_cross_at ? signals.last_cross_at.replace("T", " ").slice(0, 16) : "—"}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--vr-line)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span className="t-label" style={{ fontSize: 10 }}>Signal Strength</span>
          <span className="t-num" style={{ fontSize: 11, color: signalStrength != null ? "var(--vr-cream)" : "var(--vr-cream-mute)" }}>
            {signalStrength != null ? `${signalStrength.toFixed(0)}%` : (signals?.signal_strength_label ?? "—")}
          </span>
        </div>
        <div style={{ height: 4, background: "rgba(241,236,224,0.05)", borderRadius: 2, overflow: "hidden" }}>
          <div
            style={{
              width: `${Math.max(0, Math.min(signalStrength ?? 0, 100))}%`,
              height: "100%",
              background: "var(--vr-gold)",
            }}
          />
        </div>
        {signals?.note && (
          <div className="t-label" style={{ fontSize: 10, marginTop: 8, lineHeight: 1.45 }}>
            {signals.note}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Managed Exposure ladder (scaffolded) ───────────────────────────────────
function CryptoExposure({ signals }: { signals?: CryptoManagedExposureSignal | null }) {
  const tiers = signals?.ladder?.length ? signals.ladder : [
    { label: "Tier 1", exposure_pct: 80, note: "Constructive regime", active: false },
    { label: "Tier 2", exposure_pct: 70, note: "Neutral regime", active: false },
    { label: "Tier 3", exposure_pct: 0, note: "Risk-off", active: false },
  ]
  const ladderTitle = tiers
    .map(t => typeof t.exposure_pct === "number" ? Math.round(t.exposure_pct).toString() : null)
    .filter((value): value is string => value != null)
    .join(" / ")
  return (
    <div className="vr-card" style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 4 }}>Managed Exposure</div>
          <div className="t-h3" style={{ fontSize: 16 }}>
            {signals?.title ?? (ladderTitle ? `Graduated ${ladderTitle} ladder` : "Managed exposure ladder")}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="t-eyebrow" style={{ fontSize: 9, marginBottom: 3 }}>Current</div>
          <div className="t-num" style={{ fontSize: 18, color: signals?.current_exposure_pct != null ? "var(--vr-cream)" : "var(--vr-cream-mute)", fontWeight: 500 }}>
            {signals?.current_exposure_pct != null ? `${signals.current_exposure_pct.toFixed(0)}%` : "—"}
          </div>
          <div className="t-label" style={{ fontSize: 10, marginTop: 3 }}>
            {signals?.current_state?.replace(/_/g, " ") ?? "no live state"}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {tiers.map(t => (
          <div
            key={t.label ?? "tier"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              background: "transparent",
              border: `1px solid ${t.active ? "var(--vr-gold-line)" : "var(--vr-line)"}`,
              borderRadius: 2,
            }}
          >
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: t.active ? "var(--vr-gold)" : "var(--vr-cream-faint)",
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span className="t-eyebrow" style={{ fontSize: 10 }}>{t.label}</span>
                <span className="t-label" style={{ fontSize: 10 }}>{t.note}</span>
              </div>
            </div>
            <span className="t-num" style={{ fontSize: 13, color: t.active ? "var(--vr-cream)" : "var(--vr-cream-mute)" }}>{t.exposure_pct ?? "—"}%</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--vr-line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="t-label" style={{ fontSize: 11 }}>Tactical Top-Up</span>
        <StatusPill tone="neutral">{signals?.overlay_status?.replace(/_/g, " ") ?? "AWAITING FEED"}</StatusPill>
      </div>
    </div>
  )
}

// ─── Tracked Assets (scaffolded) ────────────────────────────────────────────
// Today this surfaces only the held BTCUSD row; once crypto_signals ships,
// each tracked asset gets CORE/OVERLAY tier labels + notional exposure %.
function CryptoTrackedAssets({
  positions,
  signals,
}: {
  positions: ViresPosition[]
  signals?: CryptoSignalsBlock | null
}) {
  const tracked = new Map((signals?.tracked_assets ?? []).map(item => [item.symbol, item]))
  return (
    <div className="vr-card">
      <div style={{ padding: "14px 16px 10px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div className="t-eyebrow">Tracked Assets</div>
        <span className="t-label" style={{ fontSize: 10 }}>
          {positions.length} active · {tracked.size > 0 ? "live signal feed" : "awaiting universe feed"}
        </span>
      </div>
      <div className="vr-divide" style={{ borderTop: "1px solid var(--vr-line)" }}>
        {positions.length === 0 ? (
          <div style={{ padding: "14px 16px" }}>
            <div className="t-label" style={{ fontSize: 11 }}>
              No crypto positions yet.
            </div>
          </div>
        ) : (
          positions.map(p => {
            const trackedAsset = tracked.get(p.symbol)
            const tierLabel = trackedAsset?.tier_label ?? "Tier —"
            const laneLabel = trackedAsset?.lane ?? "CORE"
            return (
              <div
                key={p.symbol}
                style={{ padding: "12px 16px", display: "flex", gap: 12, alignItems: "center" }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span className="t-ticker" style={{ fontSize: 13 }}>{p.symbol}</span>
                    <StatusPill tone="gold">{`${laneLabel} · ${tierLabel}`}</StatusPill>
                  </div>
                  <div className="t-label" style={{ fontSize: 11, lineHeight: 1.45 }}>
                    {trackedAsset?.target_exposure_pct != null
                      ? `Target exposure ${trackedAsset.target_exposure_pct.toFixed(0)}% · ${trackedAsset.state?.replace(/_/g, " ") ?? "live state"}`
                      : "Notional tier + exposure % land with the crypto_signals feed."}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="t-num" style={{ fontSize: 11, color: "var(--vr-cream)" }}>
                    {fmtCurrency(p.market_value)}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ─── Sleeve screens ─────────────────────────────────────────────────────────

export function StocksScreen({ data, rules }: {
  data: ViresTradingData & { strategy_universe?: ViresStrategyUniverse | null }
  rules?: StrategyRules
}) {
  const positions = data.positions.filter(p => (p.asset_type ?? "EQUITY") === "EQUITY") as ViresPosition[]
  const effectiveRules: StrategyRules = rules ?? { stop_loss_pct: null, target_pct: null }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <SleeveSummary sleeve="stocks" positions={positions} />
      <OpenPositions positions={positions} />
      <StrategyUniverse universe={data.strategy_universe ?? null} positions={positions} rules={effectiveRules} />
    </div>
  )
}

export function OptionsScreen({ data }: { data: ViresTradingData }) {
  const positions = data.positions.filter(p => p.asset_type === "OPTION")
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <SleeveSummary sleeve="options" positions={positions as ViresPosition[]} />
      <OpenPositions positions={positions as ViresPosition[]} />
      <div className="vr-card" style={{ padding: 18 }}>
        <div className="t-eyebrow" style={{ marginBottom: 6 }}>Bull Put Spreads · Hedges</div>
        <div className="t-h4" style={{ color: "var(--vr-cream-dim)" }}>No strategies deployed</div>
        <div className="t-label" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.5 }}>
          Awaiting BPS variant promotion from the Bench. Target: weekly income with defined risk.
        </div>
      </div>
    </div>
  )
}

export function CryptoScreen({ data, operator }: { data: ViresTradingData; operator?: unknown }) {
  const positions = data.positions.filter(p => p.asset_type === "CRYPTO") as ViresPosition[]
  const signals = (operator as CryptoSignalsOperator | null | undefined)?.crypto_signals ?? undefined
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <SleeveSummary sleeve="crypto" positions={positions} />
      <OpenPositions positions={positions} />
      <CryptoTSMOM signals={signals?.tsmom} />
      <CryptoExposure signals={signals?.managed_exposure} />
      <CryptoTrackedAssets positions={positions} signals={signals} />
      <CryptoArchitecture signals={signals?.managed_exposure} />
    </div>
  )
}
