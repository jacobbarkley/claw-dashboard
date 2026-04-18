"use client"

import { useEffect, useState } from "react"

// Picks champagne (default / day) vs obsidian (night) identity by local hour.
// 6am–6pm inclusive-exclusive → champagne. 6pm–6am → obsidian. Re-evaluates
// at each minute mark so a browser left open through sunset / sunrise
// automatically flips. Stays in champagne until hydration completes to avoid
// an SSR/client mismatch — the server has no local clock.
function currentTheme(): "champagne" | "obsidian" {
  const hour = new Date().getHours()
  return hour >= 6 && hour < 18 ? "champagne" : "obsidian"
}

export function ViresFrame({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<"champagne" | "obsidian">("champagne")

  useEffect(() => {
    setTheme(currentTheme())
    const id = setInterval(() => setTheme(currentTheme()), 60_000)
    return () => clearInterval(id)
  }, [])

  return (
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
  )
}
