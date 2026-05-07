import { EventHistorySurface } from "@/components/vires/guided/event-history-surface"
import { PreviewPageShell } from "@/components/vires/guided/shared"
import { MOCK_EVENTS_VIEW } from "@/components/vires/guided/mocks"

export default function GuidedEventsPreview() {
  return (
    <PreviewPageShell
      title="Unified event history"
      subtitle="S11 mocked. Reads from enrollment_events_view.v1. Every lane represented (strategy_execution, portfolio_action, cash_management, broker_confirmation, manual_action, support_intervention)."
      surfaceId="S11"
    >
      <EventHistorySurface eventsView={MOCK_EVENTS_VIEW} />
    </PreviewPageShell>
  )
}
