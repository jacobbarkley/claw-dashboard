"use client"

// Vires Trading shell — sub-nav (Home / Stocks / Options / Crypto) + active
// view. Receives the operator feed from a server component loader for fast
// first paint, then takes over with /api/trading polling (60s + on focus).

import { useState } from "react"
import { ViresTradingHome, type ViresTradingData } from "./trading-home"
import { StocksScreen, OptionsScreen, CryptoScreen } from "./sleeve-views"
import { useLivePoll } from "./use-live-poll"

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

// The feed shape /api/trading serves — the subset we consume at least.
interface FeedShape {
  account?: ViresTradingData["account"]
  positions?: ViresTradingData["positions"]
  equity_curve?: ViresTradingData["equity_curve"]
  operator?: OperatorBlock
  strategy_universe?: unknown
}

export function ViresTradingShell({ data: initialData, operator: initialOperator }: {
  data: (ViresTradingData & { operator?: OperatorBlock; strategy_universe?: unknown }) | null
  operator?: OperatorBlock
}) {
  const [tab, setTab] = useState<SubTab>("home")

  // Live poll /api/trading. Pass the server-rendered initial feed so first
  // paint is instant, then the hook refreshes every 60s + on focus.
  const initialFeed: FeedShape | null = initialData
    ? { ...initialData, operator: initialData.operator ?? initialOperator }
    : null
  const { data: live } = useLivePoll<FeedShape>("/api/trading", initialFeed)

  const data = (live as (ViresTradingData & { operator?: OperatorBlock; strategy_universe?: unknown }) | null) ?? initialData
  const operator = data?.operator ?? initialOperator

  if (!data) {
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
      <div className="vr-screen vires-screen-pad" style={{ maxWidth: 1100, margin: "0 auto" }}>
        {tab === "home"    && <ViresTradingHome data={data} operator={operator as never} onNavigateSleeve={setTab} />}
        {tab === "stocks"  && <StocksScreen data={data as Parameters<typeof StocksScreen>[0]["data"]} rules={extractStrategyRules(operator)} />}
        {tab === "options" && <OptionsScreen data={data} />}
        {tab === "crypto"  && <CryptoScreen data={data} />}
      </div>
    </>
  )
}
