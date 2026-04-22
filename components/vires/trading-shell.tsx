"use client"

// Vires Trading shell — sub-nav (Home / Stocks / Options / Crypto) + active
// view. Receives the operator feed from a server component loader for fast
// first paint, then takes over with /api/trading polling (60s + on focus).

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ViresTradingHome, type ViresTradingData } from "./trading-home"
import { StocksScreen, OptionsScreen, CryptoScreen } from "./sleeve-views"
import { ViresTimeframeProvider } from "./timeframe-context"
import { useSwipeNavigation } from "./use-swipe-navigation"

// Opaque operator shape — passed through to home-extras which owns its own
// narrow types. Keeping it untyped here avoids re-declaring the same shape
// in two places.
type OperatorBlock = unknown

// Pull the active strategy's stop_loss_pct / target_pct out of the operator
// block so StocksScreen's Qualified Universe can render SL / TP for held
// names. Returns nulls when the operator field isn't populated yet.
function extractStrategyRules(operator: OperatorBlock): { stop_loss_pct: number | null; target_pct: number | null } {
  const o = operator as {
    strategy_bank?: {
      active?: {
        planning_profile?: { stop_loss_pct?: number; target_pct?: number } | null
      } | null
    } | null
  } | null
  const profile = o?.strategy_bank?.active?.planning_profile
  return {
    stop_loss_pct: typeof profile?.stop_loss_pct === "number" ? profile.stop_loss_pct : null,
    target_pct: typeof profile?.target_pct === "number" ? profile.target_pct : null,
  }
}

type SubTab = "home" | "stocks" | "options" | "crypto"

const TABS: Array<{ key: SubTab; label: string }> = [
  { key: "home",    label: "Home"    },
  { key: "stocks",  label: "Stocks"  },
  { key: "options", label: "Options" },
  { key: "crypto",  label: "Crypto"  },
]

function SubNav({ tab, onTab }: { tab: SubTab; onTab: (t: SubTab) => void }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 0,
        padding: "0 18px",
        borderBottom: "1px solid var(--vr-line)",
        background: "var(--vr-ink)",
        position: "sticky",
        top: 49,
        zIndex: 20,
      }}
    >
      {TABS.map(t => {
        const active = tab === t.key
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onTab(t.key)}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "12px 4px 11px",
              position: "relative",
              fontFamily: "var(--ff-sans)",
              fontSize: 12,
              fontWeight: 500,
              color: active ? "var(--vr-cream)" : "var(--vr-cream-mute)",
              letterSpacing: 0,
            }}
          >
            {t.label}
            {active && (
              <span
                style={{
                  position: "absolute",
                  left: "50%",
                  bottom: -1,
                  transform: "translateX(-50%)",
                  width: 20,
                  height: 2,
                  background: "var(--vr-gold)",
                }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

export function ViresTradingShell({ data: initialData, operator: initialOperator }: {
  data: (ViresTradingData & { operator?: OperatorBlock; strategy_universe?: unknown }) | null
  operator?: OperatorBlock
}) {
  const [tab, setTab] = useState<SubTab>("home")
  const [liveData, setLiveData] = useState<ViresTradingData | null>(initialData)
  const [liveOperator, setLiveOperator] = useState<OperatorBlock | undefined>(initialOperator)
  const [slideDir, setSlideDir] = useState<"forward" | "back" | null>(null)
  const router = useRouter()
  const swipeContainerRef = useRef<HTMLDivElement | null>(null)

  // Tab change with direction tracked for the slide animation. Button taps
  // on the sub-nav infer direction from the index delta; swipe gestures
  // pre-set direction before calling setTab.
  const switchTab = useCallback(
    (nextKey: SubTab, direction?: "forward" | "back") => {
      if (nextKey === tab) return
      const curIdx = TABS.findIndex(t => t.key === tab)
      const nextIdx = TABS.findIndex(t => t.key === nextKey)
      setSlideDir(direction ?? (nextIdx > curIdx ? "forward" : "back"))
      setTab(nextKey)
    },
    [tab],
  )

  // Swipe navigation — horizontal swipes on the content body cycle through
  // Home → Stocks → Options → Crypto. Right-edge swipe LEFT pushes to the
  // Bench surface. No left-edge handler on Trading — iOS Safari owns the
  // left-edge-right-swipe as native browser-back.
  const handleNext = useCallback(() => {
    const idx = TABS.findIndex(t => t.key === tab)
    const next = TABS[Math.min(TABS.length - 1, idx + 1)]
    if (next && next.key !== tab) switchTab(next.key, "forward")
  }, [tab, switchTab])
  const handlePrev = useCallback(() => {
    const idx = TABS.findIndex(t => t.key === tab)
    const prev = TABS[Math.max(0, idx - 1)]
    if (prev && prev.key !== tab) switchTab(prev.key, "back")
  }, [tab, switchTab])
  const handleEdgeRight = useCallback(() => {
    router.push("/vires/bench")
  }, [router])

  useSwipeNavigation({
    containerRef: swipeContainerRef,
    onNext: handleNext,
    onPrev: handlePrev,
    onEdgeSwipeFromRight: handleEdgeRight,
  })

  // Reset scroll on initial mount so iOS Safari's automatic scroll restore
  // doesn't open /vires mid-content. Also fires when the user switches sub
  // tabs so each tab opens at its own top.
  useEffect(() => {
    if (typeof window !== "undefined") window.scrollTo(0, 0)
  }, [tab])

  // Keep local state in sync with server-rendered initial props when the
  // parent re-mounts us with fresh data.
  useEffect(() => {
    setLiveData(initialData)
  }, [initialData])

  useEffect(() => {
    setLiveOperator(initialOperator)
  }, [initialOperator])

  // Poll the operator feed + the live broker endpoint every 60s (and on
  // focus). Codex's dual-fetch merges real-time Alpaca positions/account
  // from /api/trading/live on top of the 5-min operator feed so the hub
  // stays fresh without a redeploy.
  useEffect(() => {
    let cancelled = false

    async function refresh() {
      try {
        const [feedRes, liveRes] = await Promise.all([
          fetch("/api/trading", { cache: "no-store" }),
          fetch("/api/trading/live", { cache: "no-store" }).catch(() => null),
        ])
        if (!feedRes.ok) return

        const nextFeed = await feedRes.json()
        const nextLive = liveRes && liveRes.ok ? await liveRes.json() : null

        if (cancelled) return

        // /api/trading/live returns positions with `avg_entry`, but the
        // Vires components expect `entry_price` (from the operator feed
        // shape). Normalize the field name + coerce numeric types when we
        // merge so every sleeve view sees a consistent ViresPosition.
        const normalizeLivePosition = (lp: Record<string, unknown>) => ({
          symbol: lp.symbol,
          qty: Number(lp.qty ?? 0),
          side: lp.side,
          entry_price: Number(lp.avg_entry ?? lp.entry_price ?? 0),
          current_price: Number(lp.current_price ?? 0),
          market_value: Number(lp.market_value ?? 0),
          unrealized_pnl: Number(lp.unrealized_pnl ?? 0),
          unrealized_pct: lp.unrealized_pct == null ? null : Number(lp.unrealized_pct),
          change_today_pct: Number(lp.change_today_pct ?? 0),
          asset_type: (lp.asset_type as string) ?? "EQUITY",
        })

        const merged = nextLive
          ? {
              ...nextFeed,
              account: {
                ...nextFeed.account,
                ...nextLive.account,
              },
              positions: Array.isArray(nextLive.positions)
                ? nextLive.positions.map(normalizeLivePosition)
                : nextFeed.positions,
            }
          : nextFeed

        setLiveData(merged)
        setLiveOperator(merged?.operator ?? null)
      } catch {
        // Leave the initial server payload in place if refresh fails.
      }
    }

    void refresh()
    const interval = window.setInterval(refresh, 60_000)
    window.addEventListener("focus", refresh)
    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.removeEventListener("focus", refresh)
    }
  }, [])

  const currentData = liveData ?? initialData
  const currentOperator = liveOperator ?? initialOperator

  if (!currentData) {
    return (
      <div style={{ padding: 32 }}>
        <div className="vr-card" style={{ padding: 32 }}>
          <div className="t-eyebrow" style={{ marginBottom: 8 }}>No data</div>
          <div className="t-label">
            data/operator-feed.json not found. Run scripts/prepare-production-operator-feed.sh.
          </div>
        </div>
      </div>
    )
  }

  const slideClass = slideDir === "forward"
    ? "vr-tab-slide-forward"
    : slideDir === "back"
      ? "vr-tab-slide-back"
      : undefined

  return (
    <ViresTimeframeProvider>
      <SubNav tab={tab} onTab={switchTab} />
      <div
        ref={swipeContainerRef}
        style={{ touchAction: "pan-y" }}
      >
        <div
          key={tab}
          className={slideClass}
          onAnimationEnd={() => setSlideDir(null)}
          style={{ maxWidth: 1100, margin: "0 auto" }}
        >
          <div className="vr-screen vires-screen-pad">
            {tab === "home"    && <ViresTradingHome data={currentData} operator={currentOperator as never} onNavigateSleeve={switchTab} />}
            {tab === "stocks"  && <StocksScreen data={currentData as Parameters<typeof StocksScreen>[0]["data"]} rules={extractStrategyRules(currentOperator)} operator={currentOperator} />}
            {tab === "options" && <OptionsScreen data={currentData} operator={currentOperator} />}
            {tab === "crypto"  && <CryptoScreen data={currentData} operator={currentOperator} />}
          </div>
        </div>
      </div>
    </ViresTimeframeProvider>
  )
}
