"use client"

// Bench-side swipe navigation wrapper. Mounts inside the bench layout
// so it spans every bench child route, but only ENABLES the gesture
// when the user is on one of the three canonical sub-tab routes
// (/vires/bench, /vires/bench/campaigns, /vires/bench/lab). Nested
// drill-in routes under passport/run skip the gesture so the page's
// own back affordance isn't contested.
//
// Behavior (bench-level):
//   - Swipe LEFT on content body  = move to next tab (home → campaigns → lab)
//   - Swipe RIGHT on content body = move to previous tab (lab → campaigns → home)
//   - Left-edge swipe RIGHT       = back to /vires (Trading)
//     Aligns with iOS Safari's native back-swipe — same outcome either
//     way, so the two gestures don't fight each other.
//
// Animation: adjacent-tab transitions slide in from the direction of
// travel, matching the Trading sub-tab animation. Route-level
// transition is detected via pathname change in useLayoutEffect so
// the slide class applies on the new render's paint — no flicker.
// Nested drill-ins (passport/run) skip the animation entirely.

import { useCallback, useLayoutEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useSwipeNavigation } from "./use-swipe-navigation"

type BenchTab = "home" | "campaigns" | "lab"

const TAB_ORDER: BenchTab[] = ["home", "campaigns", "lab"]

const TAB_HREF: Record<BenchTab, string> = {
  home: "/vires/bench",
  campaigns: "/vires/bench/campaigns",
  lab: "/vires/bench/lab",
}

function resolveTab(pathname: string): BenchTab | null {
  if (pathname.startsWith("/vires/bench/lab")) return "lab"
  // Campaign INDEX participates in the tab cycle; campaign DETAIL drills
  // down and manages its own swipe-right-to-index gesture (see
  // campaigns-detail.tsx).
  if (pathname === "/vires/bench/campaigns") return "campaigns"
  if (pathname.startsWith("/vires/bench/campaigns/")) return null
  if (
    pathname.startsWith("/vires/bench/passport") ||
    pathname.startsWith("/vires/bench/run")
  ) {
    return null
  }
  if (pathname === "/vires/bench" || pathname.startsWith("/vires/bench/")) return "home"
  return null
}

// Ordinal for animation direction. Nested drill-ins return null so the
// animation is skipped when entering / leaving those routes.
function tabIndex(pathname: string): number | null {
  const t = resolveTab(pathname)
  if (!t) return null
  return TAB_ORDER.indexOf(t)
}

export function BenchSwipeCapture({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/vires/bench"
  const router = useRouter()
  const ref = useRef<HTMLDivElement | null>(null)
  const tab = resolveTab(pathname)

  // Track previous pathname so pathname transitions can infer animation
  // direction. Stored in a ref so it doesn't force re-renders on every
  // mount, and cleared after the animation plays.
  const prevPathRef = useRef(pathname)
  const [slideDir, setSlideDir] = useState<"forward" | "back" | null>(null)

  useLayoutEffect(() => {
    if (prevPathRef.current === pathname) return
    const prevIdx = tabIndex(prevPathRef.current)
    const curIdx = tabIndex(pathname)
    if (prevIdx != null && curIdx != null && prevIdx !== curIdx) {
      setSlideDir(curIdx > prevIdx ? "forward" : "back")
    } else {
      setSlideDir(null)
    }
    prevPathRef.current = pathname
  }, [pathname])

  // Walk the tab order forward on swipe-left, backward on swipe-right.
  // Anywhere else (nested views) we disable the hook entirely via the
  // enabled flag below.
  const handleNext = useCallback(() => {
    if (!tab) return
    const idx = TAB_ORDER.indexOf(tab)
    const next = TAB_ORDER[idx + 1]
    if (next) router.push(TAB_HREF[next])
  }, [tab, router])
  const handlePrev = useCallback(() => {
    if (!tab) return
    const idx = TAB_ORDER.indexOf(tab)
    const prev = TAB_ORDER[idx - 1]
    if (prev) router.push(TAB_HREF[prev])
  }, [tab, router])
  const handleEdgeLeft = useCallback(() => {
    router.push("/vires")
  }, [router])

  useSwipeNavigation({
    containerRef: ref,
    onNext: handleNext,
    onPrev: handlePrev,
    onEdgeSwipeFromLeft: handleEdgeLeft,
    enabled: tab !== null,
  })

  const slideClass = slideDir === "forward"
    ? "vr-tab-slide-forward"
    : slideDir === "back"
      ? "vr-tab-slide-back"
      : undefined

  return (
    <div ref={ref} style={{ touchAction: "pan-y" }}>
      <div
        key={pathname}
        className={slideClass}
        onAnimationEnd={() => setSlideDir(null)}
      >
        {children}
      </div>
    </div>
  )
}
