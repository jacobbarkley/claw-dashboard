"use client"

// Shared timeframe state for every chart on /vires. Set it on the main
// Equity Curve or on any sleeve sparkline and all the other charts on the
// page snap to the same window. Matches the design handoff's
// useSharedTimeframe pattern but via React Context instead of
// localStorage + CustomEvents — cleaner within a single-page tree.

import { createContext, useContext, useState, type ReactNode } from "react"

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
