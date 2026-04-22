"use client"

// Top-level route transition for /vires → /vires/bench* crossings.
// Lives inside app/vires/layout.tsx so the wrapper persists across the
// boundary (only the child route remounts), and we can detect the
// crossing via pathname diffing in useLayoutEffect.
//
// Ordering: Trading (/vires exact) is screen 0, everything under
// /vires/bench* is screen 1. Moving forward (Trading → Bench) slides
// in from the right; moving back (Bench → Trading) slides in from the
// left. Nested sub-tab animations inside Trading (TradingShell) and
// Bench (BenchSwipeCapture) are orthogonal — those sub-wrappers mount
// fresh on boundary crossings so their own prevPath ref initializes
// to the new pathname and their animation effect no-ops.

import { useLayoutEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"

type Zone = "trading" | "bench" | "other"

function zoneFor(pathname: string): Zone {
  if (pathname === "/vires") return "trading"
  if (pathname.startsWith("/vires/bench")) return "bench"
  return "other"
}

function zoneIndex(z: Zone): number | null {
  if (z === "trading") return 0
  if (z === "bench") return 1
  return null
}

export function ViresRouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/vires"
  const prevPathRef = useRef(pathname)
  // Bumped on every boundary crossing so the slide class re-applies
  // via a fresh key. Within-zone navigations don't bump the nonce, so
  // the wrapper stays mounted and child route updates keep their own
  // sub-tab animation behavior.
  const [nonce, setNonce] = useState(0)
  const [slideDir, setSlideDir] = useState<"forward" | "back" | null>(null)

  useLayoutEffect(() => {
    if (prevPathRef.current === pathname) return
    const prevIdx = zoneIndex(zoneFor(prevPathRef.current))
    const curIdx = zoneIndex(zoneFor(pathname))
    prevPathRef.current = pathname
    if (prevIdx == null || curIdx == null || prevIdx === curIdx) return
    setSlideDir(curIdx > prevIdx ? "forward" : "back")
    setNonce(n => n + 1)
  }, [pathname])

  const slideClass = slideDir === "forward"
    ? "vr-tab-slide-forward"
    : slideDir === "back"
      ? "vr-tab-slide-back"
      : undefined

  return (
    <div
      key={nonce}
      className={slideClass}
      onAnimationEnd={() => setSlideDir(null)}
    >
      {children}
    </div>
  )
}
