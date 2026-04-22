"use client"

// Bench sub-nav — `Home` · `Campaigns`. Home is production-only (what IS
// in production right now). Campaigns is research-only (what is competing
// to deserve capital next). Zero-overlap invariant per the v3 design handoff.
//
// Sub-nav hides in nested views (passport, run) so the back affordance on
// those pages doesn't compete with a tab bar.
//
// Route truth > localStorage. The URL IS the active-tab state, so reload /
// share / deep-link all behave naturally.

import Link from "next/link"
import { usePathname } from "next/navigation"

type TabKey = "home" | "campaigns"

const TABS: Array<{ href: string; key: TabKey; label: string }> = [
  { href: "/vires/bench",           key: "home",      label: "Home"      },
  { href: "/vires/bench/campaigns", key: "campaigns", label: "Campaigns" },
]

function resolveActive(pathname: string): TabKey | null {
  if (pathname.startsWith("/vires/bench/campaigns")) return "campaigns"
  if (
    pathname.startsWith("/vires/bench/passport") ||
    pathname.startsWith("/vires/bench/run")
  ) {
    return null
  }
  if (pathname === "/vires/bench" || pathname.startsWith("/vires/bench/")) return "home"
  return null
}

export function ViresBenchSubNav() {
  const pathname = usePathname() ?? "/vires/bench"
  const active = resolveActive(pathname)
  if (!active) return null

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "14px 18px 0",
        gap: 6,
      }}
    >
      {TABS.map(t => {
        const isActive = active === t.key
        return (
          <Link
            key={t.key}
            href={t.href}
            className="t-eyebrow"
            style={{
              padding: "8px 14px",
              borderBottom: isActive
                ? "1px solid var(--vr-gold)"
                : "1px solid transparent",
              color: isActive ? "var(--vr-cream)" : "var(--vr-cream-mute)",
              fontWeight: 500,
              fontSize: 10,
              letterSpacing: "0.18em",
              textDecoration: "none",
              transition: "color 120ms ease",
            }}
          >
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}
