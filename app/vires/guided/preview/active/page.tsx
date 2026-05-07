import { ActiveEnrollmentSurface } from "@/components/vires/guided/active-enrollment-surface"
import { MockFallbackBadge, PreviewPageShell } from "@/components/vires/guided/shared"
import { MOCK_ENROLLMENT_VIEW_ACTIVE } from "@/components/vires/guided/mocks"
import {
  GuidedArtifactMissingError,
  GuidedUserStateUnavailableError,
  readGuidedEnrollmentView,
} from "@/lib/guided-data-source.server"
import type { GuidedEnrollmentView } from "@/components/vires/guided/types"

export const dynamic = "force-dynamic"

const PHASE_6_2_ACTIVE_ENROLLMENT_ID = "enrollment_entry_zero_active"

async function loadRealOrMock(): Promise<{ view: GuidedEnrollmentView; fallback: string | null }> {
  try {
    const view = await readGuidedEnrollmentView(PHASE_6_2_ACTIVE_ENROLLMENT_ID)
    return { view, fallback: null }
  } catch (err) {
    if (err instanceof GuidedUserStateUnavailableError) {
      return { view: MOCK_ENROLLMENT_VIEW_ACTIVE, fallback: "GUIDED_LOCAL_REBUILD_PATH unset (production preview)" }
    }
    if (err instanceof GuidedArtifactMissingError) {
      return { view: MOCK_ENROLLMENT_VIEW_ACTIVE, fallback: `seed missing (${err.artifactPath})` }
    }
    throw err
  }
}

export default async function GuidedActivePreview() {
  const { view, fallback } = await loadRealOrMock()
  return (
    <PreviewPageShell
      title="ACTIVE paper enrollment"
      subtitle={
        fallback
          ? "S9 preview · mock fallback (user-state read unavailable)"
          : "S9 preview · live read of guided_enrollment_view.v1 from rebuild state"
      }
      surfaceId="S9"
    >
      {fallback ? <MockFallbackBadge reason={fallback} /> : null}
      <ActiveEnrollmentSurface view={view} />
    </PreviewPageShell>
  )
}
