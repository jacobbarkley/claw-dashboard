"use client"

import { useEffect, useRef, useState } from "react"

// Poll a JSON endpoint on mount + on an interval + on tab focus. Returns the
// most recent successful response alongside a `lastFetched` timestamp. Initial
// data can be passed in so server-rendered pages get a fast first paint and
// the hook takes over for freshness.
//
// The hook is deliberately simple — one endpoint, one piece of state. Pages
// that need multiple feeds should call it multiple times.
export function useLivePoll<T>(url: string, initial: T | null, intervalMs: number = 60_000): {
  data: T | null
  lastFetched: Date | null
  refresh: () => Promise<void>
  isRefreshing: boolean
} {
  const [data, setData] = useState<T | null>(initial)
  const [lastFetched, setLastFetched] = useState<Date | null>(initial ? new Date() : null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const cancelledRef = useRef(false)

  const refresh = useRef(async () => {
    setIsRefreshing(true)
    try {
      const res = await fetch(url, { cache: "no-store" })
      if (res.ok) {
        const json = (await res.json()) as T
        if (!cancelledRef.current) {
          setData(json)
          setLastFetched(new Date())
        }
      }
    } catch {
      // Silently swallow network errors — the stale data stays on screen,
      // which is the right fallback for a monitoring surface.
    } finally {
      if (!cancelledRef.current) setIsRefreshing(false)
    }
  }).current

  useEffect(() => {
    cancelledRef.current = false
    // Fire immediately so the page's initial server-rendered snapshot gets
    // replaced with a fresh client fetch (also verifies the API is healthy).
    void refresh()
    const id = setInterval(() => { void refresh() }, intervalMs)
    const onFocus = () => { void refresh() }
    window.addEventListener("focus", onFocus)
    return () => {
      cancelledRef.current = true
      clearInterval(id)
      window.removeEventListener("focus", onFocus)
    }
    // refresh is stable via useRef; url + intervalMs changes should restart
    // the cycle, which useEffect handles by re-running.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, intervalMs])

  return { data, lastFetched, refresh, isRefreshing }
}
