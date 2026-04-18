"use client"

// Vires Trading shell — sub-nav (Home / Stocks / Options / Crypto) + active
// view. Receives the operator feed from a server component loader and
// switches body content client-side. Keeps the inner Trading/Bench/Plateau
// nav (rendered by app/vires/layout.tsx) above this.

import { useEffect, useState } from "react"
import { ViresTradingHome, type ViresTradingData } from "./trading-home"
import { StocksScreen, OptionsScreen, CryptoScreen } from "./sleeve-views"

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

export function ViresTradingShell({ data, operator }: {
  data: ViresTradingData | null
  operator?: OperatorBlock
}) {
  const [tab, setTab] = useState<SubTab>("home")
  const [liveData, setLiveData] = useState<ViresTradingData | null>(data)
  const [liveOperator, setLiveOperator] = useState<OperatorBlock | undefined>(operator)

  useEffect(() => {
    setLiveData(data)
  }, [data])

  useEffect(() => {
    setLiveOperator(operator)
  }, [operator])

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

        const merged = nextLive
          ? {
              ...nextFeed,
              account: {
                ...nextFeed.account,
                ...nextLive.account,
              },
              positions: Array.isArray(nextLive.positions) ? nextLive.positions : nextFeed.positions,
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

  const currentData = liveData ?? data
  const currentOperator = liveOperator ?? operator

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

  return (
    <>
      <SubNav tab={tab} onTab={setTab} />
    <div className="vr-screen" style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
        {tab === "home"    && <ViresTradingHome data={currentData} operator={currentOperator as never} onNavigateSleeve={setTab} />}
        {tab === "stocks"  && <StocksScreen data={currentData} rules={extractStrategyRules(currentOperator)} />}
        {tab === "options" && <OptionsScreen data={currentData} />}
        {tab === "crypto"  && <CryptoScreen data={currentData} operator={currentOperator} />}
      </div>
    </>
  )
}
