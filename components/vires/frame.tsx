"use client"

import { createContext, useContext, useEffect, useState } from "react"

// Champagne (warm cream + gold) is the default identity. Obsidian (cool
// cream + silver-blue) is opt-in via the nav toggle — earlier versions
// auto-flipped by local hour at 6pm, which turned out to be less
// preferred than a persistent champagne default with an explicit escape
// hatch. Keep the obsidian CSS variables in vires.css so the opt-in path
// still works; just don't force the flip.
type Theme = "champagne" | "obsidian"
const STORAGE_KEY = "vires:theme"

interface ThemeCtx {
  theme: Theme
  setTheme: (next: Theme) => void
  toggle: () => void
}

const ViresThemeContext = createContext<ThemeCtx | null>(null)

export function useViresTheme(): ThemeCtx {
  const ctx = useContext(ViresThemeContext)
  if (!ctx) {
    // Render-time fallback — happens only outside the provider, which
    // shouldn't occur in normal use but we stay permissive rather than
    // throw during development.
    return {
      theme: "champagne",
      setTheme: () => {},
      toggle: () => {},
    }
  }
  return ctx
}

export function ViresFrame({ children }: { children: React.ReactNode }) {
  // SSR + first client paint share "champagne" to avoid hydration drift.
  // Persisted preference is read in an effect after mount.
  const [theme, setThemeState] = useState<Theme>("champagne")

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (saved === "obsidian" || saved === "champagne") {
        setThemeState(saved)
      }
    } catch {
      // localStorage unavailable (private mode, embedded contexts) —
      // stay on champagne.
    }
  }, [])

  const setTheme = (next: Theme) => {
    setThemeState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Silent fallback — theme still flips in-memory for this session.
    }
  }

  const toggle = () => setTheme(theme === "champagne" ? "obsidian" : "champagne")

  return (
    <ViresThemeContext.Provider value={{ theme, setTheme, toggle }}>
      <div
        id="vires-frame"
        data-vr-theme={theme}
        className="vires-root"
        style={{
          // Bind the design tokens vires.css references to the loaded font
          // variables. Font variables come from the parent via className.
          ["--ff-serif" as string]: `var(--vr-font-serif), 'Iowan Old Style', Palatino, serif`,
          ["--ff-sans" as string]: `var(--vr-font-sans), ui-sans-serif, system-ui, -apple-system, sans-serif`,
          ["--ff-mono" as string]: `var(--vr-font-mono), ui-monospace, SFMono-Regular, Menlo, monospace`,
        }}
      >
        {children}
      </div>
    </ViresThemeContext.Provider>
  )
}
