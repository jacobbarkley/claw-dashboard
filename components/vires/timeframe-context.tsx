"use client"

// Shared timeframe state for every chart on /vires. Set it on the main
// Equity Curve or on any sleeve sparkline and all the other charts on the
// page snap to the same window. Matches the design handoff's
// useSharedTimeframe pattern but via React Context instead of
// localStorage + CustomEvents — cleaner within a single-page tree.

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

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
//
// The menu is rendered via createPortal to document.body so it escapes any
// overflow-hidden ancestor (e.g. .vr-card-hero, where sleeve sparklines
// live). It also flips upward when there isn't enough room below the
// trigger to render the full 6-row list.
export function TimeframeDropdown() {
  const { tf, setTf } = useSharedTimeframe()
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ left: number; top: number; flipUp: boolean } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  // Approximate menu height: 6 items × ~28px + 8px padding.
  const MENU_H = 6 * 28 + 8
  const MENU_W = 96

  const positionMenu = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    const gap = 4
    // Right-align with the button.
    const left = Math.max(8, Math.min(vw - MENU_W - 8, r.right - MENU_W))
    const flipUp = r.bottom + gap + MENU_H > vh - 8 && r.top - gap - MENU_H >= 8
    const top = flipUp ? r.top - gap - MENU_H : r.bottom + gap
    setMenuPos({ left, top, flipUp })
  }

  useEffect(() => {
    if (!open) return
    positionMenu()
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (!btnRef.current?.contains(target) && !document.getElementById("vires-tf-menu")?.contains(target)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    const onScroll = () => positionMenu()
    document.addEventListener("mousedown", onDocClick)
    document.addEventListener("keydown", onKey)
    window.addEventListener("scroll", onScroll, true)
    window.addEventListener("resize", onScroll)
    return () => {
      document.removeEventListener("mousedown", onDocClick)
      document.removeEventListener("keydown", onKey)
      window.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("resize", onScroll)
    }
  }, [open])

  const active = TIMEFRAMES.find(t => t.k === tf) ?? TIMEFRAMES[1]

  const menu =
    open && menuPos && typeof document !== "undefined"
      ? createPortal(
          <div
            id="vires-tf-menu"
            role="listbox"
            style={{
              position: "fixed",
              left: menuPos.left,
              top: menuPos.top,
              width: MENU_W,
              background: "var(--vr-ink-raised)",
              border: "1px solid var(--vr-line-hi)",
              borderRadius: 3,
              padding: 4,
              zIndex: 1100,
              boxShadow: "0 12px 28px rgba(0,0,0,0.55)",
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
                    touchAction: "manipulation",
                  }}
                >
                  {t.label}
                </button>
              )
            })}
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <button
        ref={btnRef}
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
      {menu}
    </>
  )
}
