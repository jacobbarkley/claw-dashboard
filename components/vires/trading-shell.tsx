"use client"

// Vires Trading shell — sub-nav (Home / Stocks / Options / Crypto) + active
// view. Receives the operator feed from a server component loader and
// switches body content client-side. Keeps the inner Trading/Bench/Plateau
// nav (rendered by app/vires/layout.tsx) above this.

import { useState } from "react"
import { ViresTradingHome, type ViresTradingData } from "./trading-home"
import { StocksScreen, OptionsScreen, CryptoScreen } from "./sleeve-views"

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

export function ViresTradingShell({ data }: { data: ViresTradingData | null }) {
  const [tab, setTab] = useState<SubTab>("home")

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
      <div className="vr-screen" style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
        {tab === "home"    && <ViresTradingHome data={data} />}
        {tab === "stocks"  && <StocksScreen data={data} />}
        {tab === "options" && <OptionsScreen data={data} />}
        {tab === "crypto"  && <CryptoScreen data={data} />}
      </div>
    </>
  )
}
