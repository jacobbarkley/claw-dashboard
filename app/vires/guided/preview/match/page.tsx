import { MatchProposalSurface } from "@/components/vires/guided/match-proposal-surface"
import { PreviewPageShell } from "@/components/vires/guided/shared"
import {
  MOCK_DISCLOSURE_STEADY_TIDE_V1,
  MOCK_MATCH_PROPOSAL,
  MOCK_STEADY_TIDE_CANDIDATE,
} from "@/components/vires/guided/mocks"

export default function GuidedMatchPreview() {
  return (
    <PreviewPageShell
      title="Match proposal"
      subtitle="S3 mocked. Reads from guided_match_proposal.v1 + strategy_library_entry.v1 + disclosure_version.v1 mock fixtures."
      surfaceId="S3"
    >
      <MatchProposalSurface
        proposal={MOCK_MATCH_PROPOSAL}
        libraryEntry={MOCK_STEADY_TIDE_CANDIDATE}
        disclosure={MOCK_DISCLOSURE_STEADY_TIDE_V1}
      />
    </PreviewPageShell>
  )
}
