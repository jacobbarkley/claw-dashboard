"use client"

// Shared scrubber interaction for charts on the Vires surface. iOS Stocks-
// app behavior: finger-down/move sets the scrubber index; finger-up keeps
// the scrubber where it was; tap anywhere else on the page dismisses it.
// On desktop, mouse-leave dismisses (hover semantics). Vertical page scroll
// still works because we only claim horizontal pan.

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"

export interface ChartScrubber<E extends SVGSVGElement> {
  svgRef: React.MutableRefObject<E | null>
  hoverIdx: number | null
  clearHover: () => void
  pointerHandlers: {
    onPointerDown: (e: ReactPointerEvent<E>) => void
    onPointerMove: (e: ReactPointerEvent<E>) => void
    onPointerLeave: (e: ReactPointerEvent<E>) => void
  }
  touchActionStyle: { touchAction: "pan-y" }
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
    },
    [disabled, setIdxFromPointer],
  )

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<E>) => {
      if (disabled) return
      // Only track when a button/touch is actively down on pointer devices
      // that distinguish hover from press. For mouse we still want
      // hover-tracking, so accept e.buttons === 0 (hover) for mouse too.
      if (e.pointerType === "touch" && e.pressure === 0) return
      const rect = e.currentTarget.getBoundingClientRect()
      setIdxFromPointer(e.clientX, rect)
    },
    [disabled, setIdxFromPointer],
  )

  const onPointerLeave = useCallback((e: ReactPointerEvent<E>) => {
    // Desktop mouse: hover-leave clears.
    // Mobile touch: finger-up should persist — tap-outside handles dismissal.
    if (e.pointerType === "mouse") setHoverIdx(null)
  }, [])

  return {
    svgRef,
    hoverIdx,
    clearHover,
    pointerHandlers: { onPointerDown, onPointerMove, onPointerLeave },
    touchActionStyle: { touchAction: "pan-y" },
  }
}
