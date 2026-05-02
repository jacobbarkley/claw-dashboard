"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

// Sub-navigation inside /vires/bench/lab. Mirrors the Bench sub-nav pattern so
// the visual rhythm stays consistent.
//
// `redesign` flips the tab set + label casing to the 2026-04-22 lab redesign:
// `Desk | Ideas | Jobs` (Reports retired, folded into Desk's Recently Landed
// rail). Off by default so the legacy chrome keeps working until the flag.

const LEGACY_TABS: Array<{ href: string; label: string }> = [
  { href: "/vires/bench/lab",         label: "home"    },
  { href: "/vires/bench/lab/ideas",   label: "ideas"   },
  { href: "/vires/bench/lab/jobs",    label: "jobs"    },
  { href: "/vires/bench/lab/reports", label: "reports" },
]

const REDESIGN_TABS: Array<{ href: string; label: string }> = [
  { href: "/vires/bench/lab",       label: "Desk"   },
  { href: "/vires/bench/lab/ideas", label: "Ideas"  },
  { href: "/vires/bench/lab/jobs",  label: "Jobs"   },
]

export function LabSubNav({ redesign = false }: { redesign?: boolean }) {
  const pathname = usePathname() ?? "/vires/bench/lab"
  const tabs = redesign ? REDESIGN_TABS : LEGACY_TABS
  const activeHref =
    pathname === "/vires/bench/lab"
      ? "/vires/bench/lab"
      : tabs.find(t => t.href !== "/vires/bench/lab" && pathname.startsWith(t.href))?.href ?? "/vires/bench/lab"

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
      {tabs.map(t => {
        const active = activeHref === t.href
        return (
          <Link
            key={t.href}
            href={t.href}
            className="t-eyebrow"
            style={{
              flex: 1,
              textAlign: "center",
              padding: "7px 10px",
              fontSize: 10,
              letterSpacing: "0.12em",
              textDecoration: "none",
              textTransform: "uppercase",
              borderRadius: 2,
              background: active ? "rgba(241,236,224,0.06)" : "transparent",
              color: active ? "var(--vr-cream)" : "var(--vr-cream-mute)",
            }}
          >
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}
