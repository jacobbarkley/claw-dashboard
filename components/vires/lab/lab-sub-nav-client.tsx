"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

// Client tab strip for /vires/bench/lab. The server-side LabSubNav
// (lab-sub-nav.tsx) reads the redesign flag and forwards it here so every
// page renders the right tab set without per-caller wiring.

const LEGACY_TABS: Array<{ href: string; label: string }> = [
  { href: "/vires/bench/lab",         label: "home"    },
  { href: "/vires/bench/lab/ideas",   label: "ideas"   },
  { href: "/vires/bench/lab/jobs",    label: "jobs"    },
  { href: "/vires/bench/lab/reports", label: "reports" },
]

const REDESIGN_TABS: Array<{ href: string; label: string }> = [
  { href: "/vires/bench/lab",       label: "Desk"  },
  { href: "/vires/bench/lab/ideas", label: "Ideas" },
  { href: "/vires/bench/lab/jobs",  label: "Jobs"  },
]

export function LabSubNavClient({ redesign }: { redesign: boolean }) {
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
