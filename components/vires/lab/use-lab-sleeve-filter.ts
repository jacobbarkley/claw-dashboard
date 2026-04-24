"use client"

// Shared sleeve-filter state for the Lab's list pages (Ideas, Jobs,
// Reports). Persisted to localStorage under a single key so moving
// between the three pages keeps the same filter. Uses a CustomEvent
// for same-tab propagation — browser `storage` events only fire across
// different tabs, so we add our own lightweight pub/sub.

import { useCallback, useEffect, useState } from "react"

import type { SleeveFilter } from "../campaigns-shared"

const STORAGE_KEY = "vr-lab-sleeve"
const CHANGE_EVENT = "vr-lab-sleeve-change"

const VALID: ReadonlyArray<SleeveFilter> = ["ALL", "STOCKS", "OPTIONS", "CRYPTO"]

function readFromStorage(): SleeveFilter {
  if (typeof window === "undefined") return "ALL"
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    if (v && (VALID as readonly string[]).includes(v)) return v as SleeveFilter
  } catch {
    // noop
  }
  return "ALL"
}

export function useLabSleeveFilter(): readonly [SleeveFilter, (v: SleeveFilter) => void] {
  const [sleeve, setSleeveState] = useState<SleeveFilter>("ALL")

  useEffect(() => {
    // Hydrate from localStorage once on mount.
    setSleeveState(readFromStorage())

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<SleeveFilter>).detail
      if (detail && (VALID as readonly string[]).includes(detail)) {
        setSleeveState(detail)
      }
    }
    window.addEventListener(CHANGE_EVENT, handler)
    return () => window.removeEventListener(CHANGE_EVENT, handler)
  }, [])

  const setSleeve = useCallback((v: SleeveFilter) => {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(STORAGE_KEY, v)
    } catch {
      // noop
    }
    window.dispatchEvent(new CustomEvent<SleeveFilter>(CHANGE_EVENT, { detail: v }))
  }, [])

  return [sleeve, setSleeve] as const
}
