"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ViresMark } from "./shared"
import { useViresTheme } from "./frame"

// Inner Vires shell: Trading · Bench · Plateau pills, plus the wordmark and
// the PAPER/LIVE mode pill. Lives at the top of every /vires/* route via
// app/vires/layout.tsx so the inner navigation is consistent.
//
// Per the design handoff `plateau` is italic + slightly muted because it's
// scaffolding — once Plateau primer popovers are inlined into the bench
// metric tooltips, this top-level entry can be removed. Keep until then.

// Plateau primer retired from the outer nav 2026-04-22. Its content now lives
// on passport pages via the Parameter Stability section (real plateau heatmap
// for sweep-based strategies, honest empty state elsewhere) + the Plateau /
// Era Robustness glossary InfoPops on readiness scorecards. The standalone
// /vires/plateau route still resolves for direct links, but no longer has a
// nav surface. See PASSPORT_V2_SPEC_2026-04-21.md §9 for the inlining plan.
const TABS: Array<{ href: string; key: "trading" | "bench"; label: string; italic?: boolean }> = [
  { href: "/vires",          key: "trading",  label: "trading"  },
  { href: "/vires/bench",    key: "bench",    label: "bench"    },
]

export function ViresInnerNav({ mode = "PAPER" }: { mode?: "PAPER" | "LIVE" }) {
  const pathname = usePathname() ?? "/vires"
  const { theme, toggle } = useViresTheme()
  // Map pathname → active tab key. /vires (exact) is trading; /vires/bench
  // highlights the bench tab; anything else (including the archived
  // /vires/plateau direct link) falls back to trading — no nav surface
  // to light up for the plateau primer since it's been inlined on the
  // passport pages.
  const activeKey: "trading" | "bench" =
    pathname === "/vires" ? "trading"
    : pathname.startsWith("/vires/bench") ? "bench"
    : "trading"
  const isPaper = mode === "PAPER"

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 18px",
        borderBottom: "1px solid var(--vr-line)",
        background: "rgba(10, 11, 20, 0.75)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        position: "sticky",
        top: 0,
        zIndex: 30,
        gap: 12,
      }}
    >
      <ViresMark size={16} />

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {/* Tab pill group */}
        <div
          style={{
            display: "flex",
            gap: 2,
            padding: 2,
            background: "rgba(241,236,224,0.02)",
            border: "1px solid var(--vr-line)",
            borderRadius: 3,
          }}
        >
          {TABS.map(t => {
            const active = activeKey === t.key
            return (
              <Link
                key={t.key}
                href={t.href}
                className="t-eyebrow"
                style={{
                  padding: "4px 10px",
                  borderRadius: 2,
                  background: active ? "var(--vr-gold)" : "transparent",
                  color: active ? "var(--vr-ink)" : "var(--vr-cream-mute)",
                  fontWeight: 600,
                  fontSize: 9,
                  fontStyle: t.italic ? "italic" : "normal",
                  opacity: t.italic ? 0.85 : 1,
                  textDecoration: "none",
                }}
                title={t.italic ? "Parameter Stability primer · scaffolding while inline popovers land" : undefined}
              >
                {t.label}
              </Link>
            )
          })}
        </div>

        {/* Theme toggle — champagne is the default identity; obsidian is
            available as an opt-in mood, not a clock-driven flip. */}
        <button
          type="button"
          onClick={toggle}
          title={theme === "champagne" ? "Switch to Obsidian (night palette)" : "Switch to Champagne (day palette)"}
          aria-label="Toggle theme"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            padding: 0,
            background: "transparent",
            border: "1px solid var(--vr-line)",
            borderRadius: 2,
            color: "var(--vr-cream-mute)",
            cursor: "pointer",
          }}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
            {theme === "champagne" ? (
              // Sun glyph for champagne (tap to go obsidian)
              <>
                <circle cx="6" cy="6" r="2.2" fill="currentColor" />
                <g stroke="currentColor" strokeWidth="1" strokeLinecap="round">
                  <line x1="6" y1="1" x2="6" y2="2.4" />
                  <line x1="6" y1="9.6" x2="6" y2="11" />
                  <line x1="1" y1="6" x2="2.4" y2="6" />
                  <line x1="9.6" y1="6" x2="11" y2="6" />
                  <line x1="2.5" y1="2.5" x2="3.4" y2="3.4" />
                  <line x1="8.6" y1="8.6" x2="9.5" y2="9.5" />
                  <line x1="2.5" y1="9.5" x2="3.4" y2="8.6" />
                  <line x1="8.6" y1="3.4" x2="9.5" y2="2.5" />
                </g>
              </>
            ) : (
              // Moon glyph for obsidian (tap to go champagne)
              <path
                d="M9.5 7.5a3.8 3.8 0 0 1-5-5 4 4 0 1 0 5 5z"
                fill="currentColor"
              />
            )}
          </svg>
        </button>

        {/* Mode pill */}
        <span
          className="t-eyebrow"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            color: isPaper ? "var(--vr-gold)" : "var(--vr-up)",
          }}
        >
          <span className="vr-pulse-dot" style={{ background: isPaper ? "var(--vr-gold)" : "var(--vr-up)" }} />
          {mode}
        </span>
      </div>
    </div>
  )
}
