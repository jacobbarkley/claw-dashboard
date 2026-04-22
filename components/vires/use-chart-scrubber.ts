"use client"

// Shared scrubber interaction for charts on the Vires surface. iOS Stocks-
// app behavior: finger-down/move sets the scrubber index; finger-up keeps
// the scrubber where it was; tap anywhere else on the page dismisses it.
// On desktop, mouse-leave dismisses (hover semantics).
//
// To keep finger-drag tracking working on mobile, the chart SVG needs to
// own its gestures — we call setPointerCapture on pointerdown so
// subsequent pointermove events keep firing even when the finger drifts
// off the element, and the caller must set touch-action: none on the
// chart element (not pan-y) so the browser doesn't intercept horizontal
// pan. Vertical page scroll then requires touching OFF the chart — the
// tradeoff matches the iOS Stocks scrubber feel.

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"

export interface ChartScrubber<E extends SVGSVGElement> {
  svgRef: React.MutableRefObject<E | null>
  hoverIdx: number | null
  clearHover: () => void
  pointerHandlers: {
    onPointerDown: (e: ReactPointerEvent<E>) => void
    onPointerMove: (e: ReactPointerEvent<E>) => void
    onPointerUp: (e: ReactPointerEvent<E>) => void
    onPointerLeave: (e: ReactPointerEvent<E>) => void
  }
  touchActionStyle: { touchAction: "none" }
}

export function useChartScrubber<E extends SVGSVGElement = SVGSVGElement>({
  length,
  disabled = false,
}: {
  length: number
  disabled?: boolean
}): ChartScrubber<E> {
  const svgRef = useRef<E | null>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const clearHover = useCallback(() => setHoverIdx(null), [])

  // Tap-outside dismissal while a hover is active.
  useEffect(() => {
    if (hoverIdx == null || disabled) return
    const onOutside = (e: PointerEvent) => {
      const t = e.target as Node | null
      if (svgRef.current && t && !svgRef.current.contains(t)) {
        setHoverIdx(null)
      }
    }
    document.addEventListener("pointerdown", onOutside)
    return () => document.removeEventListener("pointerdown", onOutside)
  }, [hoverIdx, disabled])

  const setIdxFromPointer = useCallback(
    (clientX: number, rect: DOMRect) => {
      if (length <= 0) return
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const i = Math.max(0, Math.min(length - 1, Math.round(ratio * (length - 1))))
      setHoverIdx(i)
    },
    [length],
  )

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<E>) => {
      if (disabled) return
      const rect = e.currentTarget.getBoundingClientRect()
      setIdxFromPointer(e.clientX, rect)
      // Capture the pointer so subsequent pointermove events keep firing
      // even when the finger drifts off the element. Without this, iOS
      // Safari stops delivering moves as soon as the touch leaves the
      // chart bounds and the scrubber freezes mid-drag.
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // Some older browsers may throw; acceptable — hover scrub still
        // works via standard event delivery.
      }
    },
    [disabled, setIdxFromPointer],
  )

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<E>) => {
      if (disabled) return
      // Mouse: hover-tracking is intended (buttons === 0 is hover).
      // Touch / pen: only track while the pointer is actively down.
      // iOS Safari reports pressure as 0 even during active touch, so
      // use buttons instead of pressure for the "down" test.
      if (e.pointerType !== "mouse" && e.buttons === 0) return
      const rect = e.currentTarget.getBoundingClientRect()
      setIdxFromPointer(e.clientX, rect)
    },
    [disabled, setIdxFromPointer],
  )

  const onPointerUp = useCallback((e: ReactPointerEvent<E>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // swallow — nothing to release on some browsers
    }
  }, [])

  const onPointerLeave = useCallback((e: ReactPointerEvent<E>) => {
    // Desktop mouse: hover-leave clears.
    // Mobile touch: finger-up should persist — tap-outside handles dismissal.
    if (e.pointerType === "mouse") setHoverIdx(null)
  }, [])

  return {
    svgRef,
    hoverIdx,
    clearHover,
    pointerHandlers: { onPointerDown, onPointerMove, onPointerUp, onPointerLeave },
    // touch-action: none tells the browser not to handle any native
    // gestures here, so the chart element receives every pointermove.
    // Vertical page scroll still works — the user just needs to touch
    // off the chart to scroll. Matches iOS Stocks app behavior.
    touchActionStyle: { touchAction: "none" },
  }
}
