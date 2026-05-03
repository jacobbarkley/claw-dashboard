"use client"

// ModePill — header-position pill showing the active questionnaire render mode
// (GUIDED / STANDARD / EXPERT display labels mapping to internal contract IDs
// BEGINNER / INTERMEDIATE / ADVANCED).
//
// Per UX plan: profile-wide default is the source of truth; this pill exposes
// a per-packet override that does NOT write back to profile. Operator picks
// their mode once and rarely touches the override.
//
// Tap the pill → 3-option picker. Tap an option → onChange fires with the
// internal contract ID. Closes on outside click or selection.

import { useEffect, useRef, useState } from "react"

import type { StrategyAuthoringRenderMode } from "@/lib/research-lab-contracts"

const MODE_DISPLAY: Record<StrategyAuthoringRenderMode, string> = {
  BEGINNER: "GUIDED",
  INTERMEDIATE: "STANDARD",
  ADVANCED: "EXPERT",
}

const MODE_DESCRIPTION: Record<StrategyAuthoringRenderMode, string> = {
  BEGINNER: "6 questions · Talon fills the rest · info bubbles on every term",
  INTERMEDIATE: "11 questions · Talon suggests · jargon-only bubbles",
  ADVANCED: "22 questions · you drive every field · no bubbles by default",
}

const MODE_ORDER: StrategyAuthoringRenderMode[] = ["BEGINNER", "INTERMEDIATE", "ADVANCED"]

interface ModePillProps {
  mode: StrategyAuthoringRenderMode
  onChange: (next: StrategyAuthoringRenderMode) => void
}

export function ModePill({ mode, onChange }: ModePillProps) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent | TouchEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    document.addEventListener("touchstart", handler)
    return () => {
      document.removeEventListener("mousedown", handler)
      document.removeEventListener("touchstart", handler)
    }
  }, [open])

  const handleSelect = (next: StrategyAuthoringRenderMode) => {
    setOpen(false)
    if (next !== mode) onChange(next)
  }

  return (
    <span ref={wrapperRef} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="t-eyebrow"
        style={{
          fontSize: 9.5,
          letterSpacing: "0.18em",
          color: "var(--vr-cream-mute)",
          border: "1px solid var(--vr-line-hi)",
          background: "transparent",
          padding: "4px 10px",
          borderRadius: 3,
          cursor: "pointer",
          fontFamily: "var(--ff-mono)",
          textTransform: "uppercase",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span>MODE: {MODE_DISPLAY[mode]}</span>
        <span style={{ opacity: 0.7, fontSize: 11 }}>↻</span>
      </button>
      {open && (
        <ul
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 30,
            minWidth: 240,
            margin: 0,
            padding: 4,
            listStyle: "none",
            border: "1px solid var(--vr-line-hi)",
            background: "var(--vr-ink)",
            borderRadius: 3,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            boxShadow: "0 6px 24px rgba(0,0,0,0.55)",
          }}
        >
          {MODE_ORDER.map(option => {
            const active = option === mode
            return (
              <li key={option} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => handleSelect(option)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    background: active ? "rgba(212, 175, 55, 0.08)" : "transparent",
                    border: "none",
                    padding: "8px 10px",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    borderRadius: 2,
                  }}
                >
                  <span
                    className="t-eyebrow"
                    style={{
                      fontSize: 9.5,
                      letterSpacing: "0.18em",
                      color: active ? "var(--vr-gold)" : "var(--vr-cream-mute)",
                      fontFamily: "var(--ff-mono)",
                      textTransform: "uppercase",
                    }}
                  >
                    {MODE_DISPLAY[option]}
                    {active ? " · CURRENT" : ""}
                  </span>
                  <span
                    className="t-read"
                    style={{ fontSize: 11, color: "var(--vr-cream-dim)", lineHeight: 1.4 }}
                  >
                    {MODE_DESCRIPTION[option]}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </span>
  )
}
