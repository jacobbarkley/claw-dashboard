import { DisclosureSurface } from "@/components/vires/guided/disclosure-surface"
import { MockFallbackBadge, PreviewPageShell } from "@/components/vires/guided/shared"
import {
  MOCK_DISCLOSURE_STEADY_TIDE_V1,
  MOCK_STEADY_TIDE_CANDIDATE,
} from "@/components/vires/guided/mocks"
import {
  GuidedArtifactMissingError,
  readDisclosureVersion,
  readStrategyLibrary,
} from "@/lib/guided-data-source.server"
import type { DisclosureVersion, StrategyLibraryEntry } from "@/components/vires/guided/types"

export const dynamic = "force-dynamic"

const ENTRY_ZERO_LIBRARY_ID = "steady_tide_internal"
const ENTRY_ZERO_DISCLOSURE_ID = "disc_steady_tide_v1"

async function loadRealOrMock(): Promise<{
  disclosure: DisclosureVersion
  libraryEntry: StrategyLibraryEntry
  fallback: string | null
}> {
  try {
    const [disclosure, library] = await Promise.all([
      readDisclosureVersion(ENTRY_ZERO_DISCLOSURE_ID),
      readStrategyLibrary(),
    ])
    const libraryEntry = library.entries.find(e => e.library_entry_id === ENTRY_ZERO_LIBRARY_ID)
    if (!libraryEntry) {
      return {
        disclosure: MOCK_DISCLOSURE_STEADY_TIDE_V1,
        libraryEntry: MOCK_STEADY_TIDE_CANDIDATE,
        fallback: `library entry "${ENTRY_ZERO_LIBRARY_ID}" missing from strategy_library.json`,
      }
    }
    return { disclosure, libraryEntry, fallback: null }
  } catch (err) {
    if (err instanceof GuidedArtifactMissingError) {
      return {
        disclosure: MOCK_DISCLOSURE_STEADY_TIDE_V1,
        libraryEntry: MOCK_STEADY_TIDE_CANDIDATE,
        fallback: `bootstrap snapshot missing (${err.artifactPath})`,
      }
    }
    throw err
  }
}

export default async function GuidedDisclosurePreview() {
  const { disclosure, libraryEntry, fallback } = await loadRealOrMock()
  return (
    <PreviewPageShell
      title="Disclosure acceptance"
      subtitle={
        fallback
          ? "S4 preview · mock fallback (bootstrap snapshot missing)"
          : "S4 preview · live read of disclosure_version.v1 + strategy_library_entry.v1 from data/guided/"
      }
      surfaceId="S4"
    >
      {fallback ? <MockFallbackBadge reason={fallback} /> : null}
      <DisclosureSurface disclosure={disclosure} libraryEntry={libraryEntry} />
    </PreviewPageShell>
  )
}
