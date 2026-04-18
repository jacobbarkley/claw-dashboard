"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ViresMark } from "./shared"

// Inner Vires shell: Trading · Bench · Plateau pills, plus the wordmark and
// the PAPER/LIVE mode pill. Lives at the top of every /vires/* route via
// app/vires/layout.tsx so the inner navigation is consistent.
//
// Per the design handoff `plateau` is italic + slightly muted because it's
// scaffolding — once Plateau primer popovers are inlined into the bench
// metric tooltips, this top-level entry can be removed. Keep until then.

const TABS: Array<{ href: string; key: "trading" | "bench" | "plateau"; label: string; italic?: boolean }> = [
  { href: "/vires",          key: "trading",  label: "trading"  },
  { href: "/vires/bench",    key: "bench",    label: "bench"    },
  { href: "/vires/plateau",  key: "plateau",  label: "plateau", italic: true },
]

export function ViresInnerNav({ mode = "PAPER" }: { mode?: "PAPER" | "LIVE" }) {
  const pathname = usePathname() ?? "/vires"
  // Map pathname → active tab key. /vires (exact) is trading; /vires/* uses
  // the second segment.
  const activeKey: "trading" | "bench" | "plateau" =
    pathname === "/vires" ? "trading"
    : pathname.startsWith("/vires/bench") ? "bench"
    : pathname.startsWith("/vires/plateau") ? "plateau"
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
