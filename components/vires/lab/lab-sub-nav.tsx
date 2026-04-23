"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

// Sub-navigation inside /vires/lab. Mirrors the Bench sub-nav pattern so
// the visual rhythm stays consistent. Every entry below is scaffolded —
// real destinations light up per the Phase 1a / 1b / 1c build order.

const TABS: Array<{ href: string; label: string; phase: string }> = [
  { href: "/vires/lab",              label: "home",    phase: "P0" },
  { href: "/vires/lab/ideas",        label: "ideas",   phase: "P2" },
  { href: "/vires/lab/jobs",         label: "jobs",    phase: "P1a" },
  { href: "/vires/lab/reports",      label: "reports", phase: "P3" },
]

export function LabSubNav() {
  const pathname = usePathname() ?? "/vires/lab"
  // Exact /vires/lab = home; anything deeper matches by the second path segment.
  const activeHref =
    pathname === "/vires/lab"
      ? "/vires/lab"
      : TABS.find(t => t.href !== "/vires/lab" && pathname.startsWith(t.href))?.href ?? "/vires/lab"

  return (
    <div
      style={{
        display: "flex",
        gap: 2,
        padding: 2,
        margin: "14px auto 0",
        maxWidth: 880,
        width: "calc(100% - 40px)",
        background: "rgba(241,236,224,0.02)",
        border: "1px solid var(--vr-line)",
        borderRadius: 3,
      }}
    >
      {TABS.map(t => {
        const active = activeHref === t.href
        return (
          <Link
            key={t.href}
            href={t.href}
            className="t-eyebrow"
            style={{
              flex: 1,
              textAlign: "center",
              padding: "6px 10px",
              fontSize: 10,
              letterSpacing: "0.12em",
              textDecoration: "none",
              textTransform: "uppercase",
              borderRadius: 2,
              background: active ? "rgba(241,236,224,0.06)" : "transparent",
              color: active ? "var(--vr-cream)" : "var(--vr-cream-mute)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <span>{t.label}</span>
            <span
              style={{
                fontSize: 8,
                color: active ? "var(--vr-gold)" : "var(--vr-cream-mute)",
                opacity: 0.6,
              }}
            >
              {t.phase}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
