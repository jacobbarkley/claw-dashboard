"use client"

import { useEffect, useRef } from "react"

const DEFAULT_MESSAGE = "Leave this Lab page? Unsaved progress on this screen will be lost."

interface UnsavedWorkGuardOptions {
  enabled: boolean
  message?: string
}

function shouldIgnoreClick(event: MouseEvent): boolean {
  return (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  )
}

function closestAnchor(target: EventTarget | null): HTMLAnchorElement | null {
  return target instanceof Element ? target.closest("a[href]") : null
}

function sameDocumentTarget(href: string): boolean {
  const current = new URL(window.location.href)
  const next = new URL(href, window.location.href)
  return (
    next.origin === current.origin &&
    next.pathname === current.pathname &&
    next.search === current.search
  )
}

function guardedHistoryState(): Record<string, unknown> {
  const state = window.history.state
  const base = state && typeof state === "object" ? state : {}
  return { ...base, __viresUnsavedWorkGuard: true }
}

export function useUnsavedWorkGuard({
  enabled,
  message = DEFAULT_MESSAGE,
}: UnsavedWorkGuardOptions) {
  const enabledRef = useRef(enabled)
  const messageRef = useRef(message)
  const allowNextPopRef = useRef(false)
  const guardedHrefRef = useRef<string | null>(null)

  useEffect(() => {
    enabledRef.current = enabled
    messageRef.current = message
  }, [enabled, message])

  useEffect(() => {
    if (!enabled) return

    guardedHrefRef.current = window.location.href
    window.history.pushState(guardedHistoryState(), "", window.location.href)

    const confirmLeave = () => !enabledRef.current || window.confirm(messageRef.current)

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!enabledRef.current) return
      event.preventDefault()
      event.returnValue = ""
    }

    const onDocumentClick = (event: MouseEvent) => {
      if (!enabledRef.current || shouldIgnoreClick(event)) return
      const anchor = closestAnchor(event.target)
      if (!anchor || anchor.hasAttribute("download")) return
      if (anchor.target && anchor.target !== "_self") return
      if (sameDocumentTarget(anchor.href)) return
      if (confirmLeave()) return
      event.preventDefault()
      event.stopPropagation()
    }

    const onPopState = () => {
      if (!enabledRef.current) return
      if (allowNextPopRef.current) {
        allowNextPopRef.current = false
        return
      }
      if (confirmLeave()) {
        allowNextPopRef.current = true
        window.setTimeout(() => window.history.back(), 0)
        return
      }
      window.history.pushState(
        guardedHistoryState(),
        "",
        guardedHrefRef.current ?? window.location.href,
      )
    }

    window.addEventListener("beforeunload", onBeforeUnload)
    window.addEventListener("popstate", onPopState)
    document.addEventListener("click", onDocumentClick, true)
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload)
      window.removeEventListener("popstate", onPopState)
      document.removeEventListener("click", onDocumentClick, true)
    }
  }, [enabled])
}
