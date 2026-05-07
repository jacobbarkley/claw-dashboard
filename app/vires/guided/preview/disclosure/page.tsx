import { DisclosureSurface } from "@/components/vires/guided/disclosure-surface"
import { PreviewPageShell } from "@/components/vires/guided/shared"
import {
  MOCK_DISCLOSURE_STEADY_TIDE_V1,
  MOCK_STEADY_TIDE_CANDIDATE,
} from "@/components/vires/guided/mocks"

export default function GuidedDisclosurePreview() {
  return (
    <PreviewPageShell
      title="Disclosure acceptance"
      subtitle="S4 mocked. Reads from disclosure_version.v1 + strategy_library_entry.v1. Mobile-first ~30s read."
      surfaceId="S4"
    >
      <DisclosureSurface
        disclosure={MOCK_DISCLOSURE_STEADY_TIDE_V1}
        libraryEntry={MOCK_STEADY_TIDE_CANDIDATE}
      />
    </PreviewPageShell>
  )
}
