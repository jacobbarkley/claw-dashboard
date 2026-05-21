import type { GuidedEvent } from "./types"

export function userVisibleGuidedEvents(events: GuidedEvent[]): GuidedEvent[] {
  return events.filter(event => event.audit_visibility === "USER_VISIBLE")
}
