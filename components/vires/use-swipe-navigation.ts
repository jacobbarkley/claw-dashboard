"use client"

// Swipe navigation — pointer-based gesture capture so Trading sub-tabs and
// Bench sub-tabs can be moved between by finger drag, with edge-swipes for
// cross-route navigation. Unified pointer events handle mouse + touch +
// pen in a single path.
//
// Axis-lock: after ~10px of first movement the gesture commits to either
// horizontal or vertical. If vertical, we stand down (user is scrolling
// the page). This means vertical page scroll is never hijacked.
//
// Nested horizontal scrollers (chart scrubbers, scroll-snap carousels,
// overflow-x tables) should carry [data-allow-horizontal-scroll] on the
// ancestor of their pointerdown target; swipe-nav skips the gesture
// entirely when that element is an ancestor.

import { useEffect, useRef } from "react"

const EDGE_ZONE_PX = 24      // left / right edge detection band
const HORIZ_THRESHOLD_PX = 60 // min horizontal delta to fire a swipe
const VERT_LIMIT_PX = 40     // gesture aborts if vertical drift exceeds this
const AXIS_LOCK_PX = 10      // when first meaningful movement exceeds this, pick an axis

export interface UseSwipeNavigationOpts {
  /** Ref to the element whose pointer events drive the gesture. */
  containerRef: React.RefObject<HTMLElement | null>
  /** Swipe LEFT on content body — typically "next tab". */
  onNext?: () => void
  /** Swipe RIGHT on content body — typically "previous tab". */
  onPrev?: () => void
  /** Swipe RIGHT starting from the LEFT edge — typically "previous route". */
  onEdgeSwipeFromLeft?: () => void
  /** Swipe LEFT starting from the RIGHT edge — typically "next route". */
  onEdgeSwipeFromRight?: () => void
  /** Gate the hook — set false to disable without unmounting. */
  enabled?: boolean
}

export function useSwipeNavigation({
  containerRef,
  onNext,
  onPrev,
  onEdgeSwipeFromLeft,
  onEdgeSwipeFromRight,
  enabled = true,
}: UseSwipeNavigationOpts) {
  // Keep the latest callbacks in a ref so the effect's listeners don't
  // reattach on every render just because a parent passed a fresh closure.
  const callbacks = useRef({ onNext, onPrev, onEdgeSwipeFromLeft, onEdgeSwipeFromRight })
  useEffect(() => {
    callbacks.current = { onNext, onPrev, onEdgeSwipeFromLeft, onEdgeSwipeFromRight }
  }, [onNext, onPrev, onEdgeSwipeFromLeft, onEdgeSwipeFromRight])

  useEffect(() => {
    if (!enabled) return
    const el = containerRef.current
    if (!el) return

    let startX: number | null = null
    let startY: number | null = null
    let axis: "h" | "v" | null = null
    let startedNearLeftEdge = false
    let startedNearRightEdge = false
    let skipGesture = false

    const reset = () => {
      startX = null
      startY = null
      axis = null
      startedNearLeftEdge = false
      startedNearRightEdge = false
      skipGesture = false
    }

    const onPointerDown = (e: PointerEvent) => {
      // Let nested horizontal-scrollers claim the gesture. Chart scrubbers,
      // scroll-snap carousels, overflow-x tables — whoever owns horizontal
      // pan inside their zone.
      const target = e.target as HTMLElement | null
      if (target?.closest?.("[data-allow-horizontal-scroll]")) {
        skipGesture = true
        return
      }
      startX = e.clientX
      startY = e.clientY
      axis = null
      skipGesture = false
      const w = window.innerWidth
      startedNearLeftEdge = e.clientX <= EDGE_ZONE_PX
      startedNearRightEdge = e.clientX >= w - EDGE_ZONE_PX
    }

    const onPointerMove = (e: PointerEvent) => {
      if (skipGesture || startX == null || startY == null) return
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      if (!axis && (Math.abs(dx) > AXIS_LOCK_PX || Math.abs(dy) > AXIS_LOCK_PX)) {
        axis = Math.abs(dx) > Math.abs(dy) ? "h" : "v"
        if (axis === "v") {
          // Vertical movement — user is scrolling. Stand down.
          skipGesture = true
        }
      }
    }

    const onPointerUp = (e: PointerEvent) => {
      if (skipGesture || startX == null || startY == null) {
        reset()
        return
      }
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      const absDx = Math.abs(dx)
      const absDy = Math.abs(dy)
      if (absDx >= HORIZ_THRESHOLD_PX && absDy <= VERT_LIMIT_PX) {
        const c = callbacks.current
        if (startedNearRightEdge && dx < 0 && c.onEdgeSwipeFromRight) {
          c.onEdgeSwipeFromRight()
        } else if (startedNearLeftEdge && dx > 0 && c.onEdgeSwipeFromLeft) {
          c.onEdgeSwipeFromLeft()
        } else if (dx < 0 && c.onNext) {
          c.onNext()
        } else if (dx > 0 && c.onPrev) {
          c.onPrev()
        }
      }
      reset()
    }

    el.addEventListener("pointerdown", onPointerDown)
    el.addEventListener("pointermove", onPointerMove)
    el.addEventListener("pointerup", onPointerUp)
    el.addEventListener("pointercancel", onPointerUp)
    return () => {
      el.removeEventListener("pointerdown", onPointerDown)
      el.removeEventListener("pointermove", onPointerMove)
      el.removeEventListener("pointerup", onPointerUp)
      el.removeEventListener("pointercancel", onPointerUp)
    }
  }, [containerRef, enabled])
}
