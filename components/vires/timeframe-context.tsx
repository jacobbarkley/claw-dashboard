"use client"

// Shared timeframe state for every chart on /vires. Set it on the main
// Equity Curve or on any sleeve sparkline and all the other charts on the
// page snap to the same window. Matches the design handoff's
// useSharedTimeframe pattern but via React Context instead of
// localStorage + CustomEvents — cleaner within a single-page tree.

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react"

export type Timeframe = "1D" | "1W" | "1M" | "3M" | "1Y" | "ALL"

export const TIMEFRAMES: ReadonlyArray<{
  k: Timeframe
  label: string
  days: number
  intradaySteps: number
}> = [
  { k: "1D",  label: "1D",  days: 1,        intradaySteps: 78 },  // 78 intraday bars ≈ 5-min session
  { k: "1W",  label: "1W",  days: 7,        intradaySteps: 26 },
  { k: "1M",  label: "1M",  days: 30,       intradaySteps: 0 },
  { k: "3M",  label: "3M",  days: 90,       intradaySteps: 0 },
  { k: "1Y",  label: "1Y",  days: 365,      intradaySteps: 0 },
  { k: "ALL", label: "ALL", days: Infinity, intradaySteps: 0 },
] as const

interface TimeframeContextValue {
  tf: Timeframe
  setTf: (v: Timeframe) => void
}

const Ctx = createContext<TimeframeContextValue | null>(null)

export function ViresTimeframeProvider({ children }: { children: ReactNode }) {
  // Default to 1W — short enough to feel alive on the modeled intraday
  // upsampling, long enough to show the current week's shape.
  const [tf, setTf] = useState<Timeframe>("1W")
  return <Ctx.Provider value={{ tf, setTf }}>{children}</Ctx.Provider>
}

export function useSharedTimeframe(): TimeframeContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) {
    // Safe fallback so a stray mount outside the provider doesn't crash.
    return { tf: "1W", setTf: () => {} }
  }
  return ctx
}

// ─── TimeframeDropdown ──────────────────────────────────────────────────────
// Compact custom dropdown used by the main Equity Curve + every sleeve
// sparkline so the selector looks and behaves identically everywhere.
// Writes through the shared context so picking one updates all charts.
export function TimeframeDropdown() {
  const { tf, setTf } = useSharedTimeframe()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onDocClick)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDocClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const active = TIMEFRAMES.find(t => t.k === tf) ?? TIMEFRAMES[1]

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="t-eyebrow"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "5px 10px",
          background: "rgba(241,236,224,0.04)",
          border: "1px solid var(--vr-line)",
          color: "var(--vr-cream-dim)",
          fontFamily: "var(--ff-sans)",
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          cursor: "pointer",
          borderRadius: 2,
          touchAction: "manipulation",
        }}
      >
        {active.label}
        <span style={{ fontSize: 8, opacity: 0.6 }}>▾</span>
      </button>
      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            background: "var(--vr-ink-raised)",
            border: "1px solid var(--vr-line-hi)",
            borderRadius: 3,
            padding: 4,
            zIndex: 50,
            boxShadow: "0 12px 28px rgba(0,0,0,0.45)",
            minWidth: 84,
          }}
        >
          {TIMEFRAMES.map(t => {
            const isActive = t.k === tf
            return (
              <button
                key={t.k}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => { setTf(t.k); setOpen(false) }}
                className="t-eyebrow"
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "right",
                  padding: "6px 10px",
                  background: isActive ? "rgba(200,169,104,0.08)" : "transparent",
                  border: "none",
                  color: isActive ? "var(--vr-gold)" : "var(--vr-cream-dim)",
                  fontFamily: "var(--ff-sans)",
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  borderRadius: 2,
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
