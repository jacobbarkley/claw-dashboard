import { MatchProposalSurfaceFromView } from "@/components/vires/guided/match-proposal-surface"
import { MockFallbackBadge, PreviewPageShell } from "@/components/vires/guided/shared"
import { MOCK_MATCH_PROPOSAL_VIEW } from "@/components/vires/guided/mocks"
import {
  GuidedArtifactMissingError,
  GuidedUserStateUnavailableError,
  readGuidedMatchProposalView,
} from "@/lib/guided-data-source.server"
import type { GuidedMatchProposalView } from "@/components/vires/guided/types"

export const dynamic = "force-dynamic"

const PHASE_6_2_PREVIEW_PROPOSAL_ID = "proposal_entry_zero_preview"

async function loadRealOrMock(): Promise<{ view: GuidedMatchProposalView; fallback: string | null }> {
  try {
    const view = await readGuidedMatchProposalView(PHASE_6_2_PREVIEW_PROPOSAL_ID)
    return { view, fallback: null }
  } catch (err) {
    if (err instanceof GuidedUserStateUnavailableError) {
      return { view: MOCK_MATCH_PROPOSAL_VIEW, fallback: "GUIDED_LOCAL_REBUILD_PATH unset (production preview)" }
    }
    if (err instanceof GuidedArtifactMissingError) {
      return { view: MOCK_MATCH_PROPOSAL_VIEW, fallback: `seed missing (${err.artifactPath})` }
    }
    throw err
  }
}

export default async function GuidedMatchPreview() {
  const { view, fallback } = await loadRealOrMock()
  return (
    <PreviewPageShell
      title="Match proposal"
      subtitle={
        fallback
          ? "S3 preview · mock fallback (user-state read unavailable)"
          : "S3 preview · live read of guided_match_proposal_view.v1 from rebuild state"
      }
      surfaceId="S3"
    >
      {fallback ? <MockFallbackBadge reason={fallback} /> : null}
      <MatchProposalSurfaceFromView view={view} />
    </PreviewPageShell>
  )
}
