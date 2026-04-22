"use client"

// Bench-side swipe navigation wrapper. Mounts inside the bench layout
// so it spans every bench child route, but only ENABLES the gesture
// when the user is on the two canonical sub-tab routes (/vires/bench
// and /vires/bench/campaigns). On nested drill-in routes (passport,
// run detail) swipe would compete with the page's own back
// affordance — we stand down there.
//
// Behavior:
//   - Swipe RIGHT on content body = move to Home (if on Campaigns)
//   - Swipe LEFT on content body  = move to Campaigns (if on Home)
//   - Left-edge swipe RIGHT       = back to /vires (Trading)
//     Aligns with iOS Safari's native back-swipe — same outcome either
//     way, so the two gestures don't fight each other.

import { useCallback, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useSwipeNavigation } from "./use-swipe-navigation"

type BenchTab = "home" | "campaigns"

function resolveTab(pathname: string): BenchTab | null {
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

export function BenchSwipeCapture({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/vires/bench"
  const router = useRouter()
  const ref = useRef<HTMLDivElement | null>(null)
  const tab = resolveTab(pathname)

  // From Home → Campaigns on swipe left; from Campaigns → Home on swipe
  // right. Anywhere else (nested views) we disable the hook entirely.
  const handleNext = useCallback(() => {
    if (tab === "home") router.push("/vires/bench/campaigns")
  }, [tab, router])
  const handlePrev = useCallback(() => {
    if (tab === "campaigns") router.push("/vires/bench")
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

  return (
    <div ref={ref} style={{ touchAction: "pan-y" }}>
      {children}
    </div>
  )
}
