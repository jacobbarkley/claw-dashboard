import { EventHistorySurface } from "@/components/vires/guided/event-history-surface"
import { MockFallbackBadge, PreviewPageShell } from "@/components/vires/guided/shared"
import { MOCK_EVENTS_VIEW } from "@/components/vires/guided/mocks"
import {
  GuidedArtifactMissingError,
  GuidedUserStateUnavailableError,
  readEnrollmentEventsView,
} from "@/lib/guided-data-source.server"
import type { EnrollmentEventsView } from "@/components/vires/guided/types"

export const dynamic = "force-dynamic"

const PHASE_6_2_ACTIVE_ENROLLMENT_ID = "enrollment_entry_zero_active"

async function loadRealOrMock(): Promise<{
  eventsView: EnrollmentEventsView
  fallback: string | null
}> {
  try {
    const eventsView = await readEnrollmentEventsView(PHASE_6_2_ACTIVE_ENROLLMENT_ID)
    return { eventsView, fallback: null }
  } catch (err) {
    if (err instanceof GuidedUserStateUnavailableError) {
      return { eventsView: MOCK_EVENTS_VIEW, fallback: "GUIDED_LOCAL_REBUILD_PATH unset (production preview)" }
    }
    if (err instanceof GuidedArtifactMissingError) {
      return { eventsView: MOCK_EVENTS_VIEW, fallback: `seed missing (${err.artifactPath})` }
    }
    throw err
  }
}

export default async function GuidedEventsPreview() {
  const { eventsView, fallback } = await loadRealOrMock()
  return (
    <PreviewPageShell
      title="Unified event history"
      subtitle={
        fallback
          ? "S11 preview · mock fallback (user-state read unavailable)"
          : "S11 preview · live read of enrollment_events_view.v1. All 7 source lanes represented."
      }
      surfaceId="S11"
    >
      {fallback ? <MockFallbackBadge reason={fallback} /> : null}
      <EventHistorySurface eventsView={eventsView} />
    </PreviewPageShell>
  )
}
