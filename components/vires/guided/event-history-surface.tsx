"use client"

import { useMemo, useState } from "react"
import type { EnrollmentEventsView, GuidedEvent, GuidedEventSource } from "./types"
import { userVisibleGuidedEvents } from "./audit-visibility"
import { FieldEyebrow, GuidedHeroCard } from "./shared"

// S11 — Unified event history. Filter by source primarily (per the
// Round 7 kind/source split). Each row carries: timestamp, action, symbol,
// reason_label, source, actor, audit_visibility, user_notified.
// support_intervention rows render distinctly so operator actions never
// look like user actions.

type SourceFilter = "all" | GuidedEventSource

const SOURCE_FILTER_OPTIONS: Array<{ key: SourceFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "strategy_execution", label: "Entries" },
  { key: "portfolio_action", label: "Exits" },
  { key: "cash_management", label: "Cash" },
  { key: "broker_confirmation", label: "Broker" },
  { key: "manual_action", label: "Manual" },
  { key: "support_intervention", label: "Support" },
  { key: "system", label: "System" },
]

export function EventHistorySurface({ eventsView }: { eventsView: EnrollmentEventsView }) {
  const [filter, setFilter] = useState<SourceFilter>("all")

  const visible = useMemo(() => {
    const userVisible = userVisibleGuidedEvents(eventsView.events)
    const filtered = filter === "all" ? userVisible : userVisible.filter(e => e.source === filter)
    return [...filtered].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1))
  }, [eventsView.events, filter])
  const hasEvents = eventsView.events.length > 0
  const hasUserVisibleEvents = userVisibleGuidedEvents(eventsView.events).length > 0

  return (
    <GuidedHeroCard>
      <FieldEyebrow>Activity</FieldEyebrow>
      <h1
        style={{
          fontSize: 22,
          fontFamily: "var(--ff-serif)",
          fontStyle: "italic",
          color: "var(--vr-cream, #f1ece0)",
          fontWeight: 400,
          marginTop: 6,
          marginBottom: 14,
        }}
      >
        Every action in one place
      </h1>

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 18 }}>
        {SOURCE_FILTER_OPTIONS.map(o => (
          <button
            key={o.key}
            type="button"
            onClick={() => setFilter(o.key)}
            style={{
              padding: "5px 10px",
              fontSize: 9,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              border: `1px solid ${filter === o.key ? "var(--vr-gold, #c8a968)" : "var(--vr-line, #2a2438)"}`,
              background: filter === o.key ? "rgba(200,169,104,0.12)" : "transparent",
              color: filter === o.key ? "var(--vr-gold, #c8a968)" : "var(--vr-cream-mute, #8c8579)",
              cursor: "pointer",
              borderRadius: 2,
            }}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {visible.length === 0 ? (
          <div
            style={{
              padding: 16,
              fontSize: 11,
              color: "var(--vr-cream-mute, #8c8579)",
              textAlign: "center",
              lineHeight: 1.55,
            }}
          >
            {!hasEvents
              ? "Paper enrollment hasn't generated any events yet."
              : !hasUserVisibleEvents
                ? "No user-visible events are published yet."
              : "No events match this filter."}
          </div>
        ) : (
          visible.map(e => <EventRow key={e.event_id} event={e} />)
        )}
      </div>

      <div
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: "1px solid var(--vr-line, #2a2438)",
          fontSize: 9,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--vr-cream-mute, #8c8579)",
        }}
      >
        Times shown in UTC
      </div>

      <div
        style={{
          marginTop: 18,
          paddingTop: 14,
          borderTop: "1px solid var(--vr-line, #2a2438)",
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 9,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--vr-gold, #c8a968)",
            fontWeight: 600,
          }}
        >
          Walkthrough complete
        </span>
        <a
          href="/vires/guided/preview"
          style={{
            padding: "10px 14px",
            border: "1px solid var(--vr-line, #2a2438)",
            color: "var(--vr-cream-dim, #c4bdac)",
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            textDecoration: "none",
            borderRadius: 2,
            marginLeft: "auto",
          }}
        >
          ← All Guided previews
        </a>
      </div>
    </GuidedHeroCard>
  )
}

function EventRow({ event }: { event: GuidedEvent }) {
  const triggeredBy = triggeredByLabel(event)
  const isSupport = event.source === "support_intervention"
  const isUserInitiated = event.actor_type === "USER"
  const accent = isSupport
    ? "var(--vr-gold, #c8a968)"
    : isUserInitiated
      ? "var(--vr-good, #9ec4a0)"
      : "var(--vr-cream-mute, #8c8579)"

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "12px 0",
        borderBottom: "1px solid var(--vr-line, #2a2438)",
      }}
    >
      <div
        style={{
          width: 4,
          flexShrink: 0,
          borderRadius: 2,
          background: accent,
          opacity: 0.7,
        }}
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 12, color: "var(--vr-cream, #f1ece0)", fontWeight: 500 }}>{actionVerb(event)}</span>
          <span style={{ fontSize: 10, color: "var(--vr-cream-mute, #8c8579)", fontFamily: "var(--ff-mono)", whiteSpace: "nowrap" }}>
            {formatEventTime(event.occurred_at)}
          </span>
        </div>
        <div style={{ fontSize: 11, color: "var(--vr-cream-dim, #c4bdac)", lineHeight: 1.5 }}>
          {event.reason_label ?? event.reason}
        </div>
        <div
          style={{
            fontSize: 9,
            color: "var(--vr-cream-mute, #8c8579)",
            fontFamily: "var(--ff-mono)",
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            marginTop: 2,
          }}
        >
          <span>by {triggeredBy}</span>
          <span>kind · {event.kind}</span>
          <span>source · {event.source}</span>
          {event.actor_type === "OPERATOR" && event.user_notified != null ? (
            <span style={{ color: event.user_notified ? "var(--vr-good, #9ec4a0)" : "var(--vr-bad, #c89090)" }}>
              user notified · {event.user_notified ? "yes" : "no"}
            </span>
          ) : null}
          {event.broker_order_id ? <span>order {event.broker_order_id.slice(-12)}</span> : null}
        </div>
      </div>
    </div>
  )
}

function triggeredByLabel(e: GuidedEvent): string {
  if (e.actor_type === "USER") return "you"
  if (e.actor_type === "OPERATOR") return `Support · ${e.actor_id}`
  // SYSTEM
  switch (e.source) {
    case "strategy_execution":
      return "Steady Tide"
    case "portfolio_action":
      return "Steady Tide (stewardship)"
    case "cash_management":
      return "Cash management"
    case "broker_confirmation":
      return "Broker"
    case "system":
      return "System"
    case "manual_action":
      return "Manual entry"
    default:
      return e.actor_id
  }
}

function actionVerb(e: GuidedEvent): string {
  if (e.kind === "CONSENT") return e.reason_label ?? "Disclosure accepted"
  if (e.kind === "STATE_CHANGE") return e.reason_label ?? e.reason
  if (e.kind === "SUPPORT_INTERVENTION") return e.reason_label ?? e.reason ?? "Support action"
  if (e.kind === "BROKER_CONFIRMATION") return `Broker filled ${e.symbol ?? ""}`.trim()
  if (e.kind === "HOLDINGS_CHANGE") {
    const qty = e.quantity != null ? `${e.quantity} ` : ""
    const sym = e.symbol ?? ""
    if (e.source === "broker_confirmation") {
      return `Broker filled ${qty}${sym}`.trim()
    }
    const verb = e.side === "BUY" ? "bought" : e.side === "SELL" ? "sold" : "moved"
    return `${qty}${sym} ${verb}`.trim()
  }
  return e.kind.toLowerCase()
}

function formatEventTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const month = String(d.getUTCMonth() + 1).padStart(2, "0")
  const day = String(d.getUTCDate()).padStart(2, "0")
  const hour = String(d.getUTCHours()).padStart(2, "0")
  const min = String(d.getUTCMinutes()).padStart(2, "0")
  return `${month}-${day} · ${hour}:${min}`
}
