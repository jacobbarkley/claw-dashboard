import { redirect } from "next/navigation"

import { ActiveEnrollmentSurface } from "@/components/vires/guided/active-enrollment-surface"
import { MockFallbackBadge, PreviewPageShell } from "@/components/vires/guided/shared"
import { MOCK_ENROLLMENT_VIEW_ACTIVE } from "@/components/vires/guided/mocks"
import {
  GuidedArtifactMissingError,
  GuidedUserStateUnavailableError,
  readGuidedEnrollmentView,
} from "@/lib/guided-data-source.server"
import {
  UnauthenticatedError,
  UnknownScopeIdentityError,
  resolveCurrentScope,
} from "@/lib/guided-scope.server"
import type { GuidedEnrollmentView, GuidedScope } from "@/components/vires/guided/types"

export const dynamic = "force-dynamic"

const PHASE_6_2_ACTIVE_ENROLLMENT_ID = "enrollment_entry_zero_active"
const SIGNIN_FROM_PATH = "/vires/guided/preview/active"

async function loadRealOrMock(
  scope: GuidedScope,
): Promise<{ view: GuidedEnrollmentView; fallback: string | null }> {
  try {
    const view = await readGuidedEnrollmentView(PHASE_6_2_ACTIVE_ENROLLMENT_ID, scope)
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
  let scope: GuidedScope
  try {
    scope = await resolveCurrentScope()
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      redirect(`/signin?from=${encodeURIComponent(SIGNIN_FROM_PATH)}`)
    }
    if (err instanceof UnknownScopeIdentityError) {
      return (
        <PreviewPageShell
          title="ACTIVE paper enrollment"
          subtitle="S9 preview · mock fallback (no Guided scope mapped to this account)"
          surfaceId="S9"
        >
          <MockFallbackBadge reason={`no Guided scope mapped to ${err.email}`} />
          <ActiveEnrollmentSurface view={MOCK_ENROLLMENT_VIEW_ACTIVE} />
        </PreviewPageShell>
      )
    }
    throw err
  }

  const { view, fallback } = await loadRealOrMock(scope)
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
