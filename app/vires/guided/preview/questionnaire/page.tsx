import { QuestionnaireSurface } from "@/components/vires/guided/questionnaire-surface"
import { MockFallbackBadge, PreviewPageShell } from "@/components/vires/guided/shared"
import { MOCK_QUESTIONNAIRE_V1 } from "@/components/vires/guided/mocks"
import {
  GuidedArtifactMissingError,
  readQuestionnaire,
} from "@/lib/guided-data-source.server"
import type { Questionnaire } from "@/components/vires/guided/types"

export const dynamic = "force-dynamic"

async function loadRealOrMock(): Promise<{ questionnaire: Questionnaire; fallback: string | null }> {
  try {
    const questionnaire = await readQuestionnaire()
    return { questionnaire, fallback: null }
  } catch (err) {
    if (err instanceof GuidedArtifactMissingError) {
      return {
        questionnaire: MOCK_QUESTIONNAIRE_V1,
        fallback: `bootstrap snapshot missing (${err.artifactPath})`,
      }
    }
    throw err
  }
}

export default async function GuidedQuestionnairePreview() {
  const { questionnaire, fallback } = await loadRealOrMock()
  return (
    <PreviewPageShell
      title="Questionnaire"
      subtitle={
        fallback
          ? "S1 + S2 preview · mock fallback (bootstrap snapshot missing). Answers do not persist."
          : "S1 + S2 preview · live read of questionnaire.v1 from data/guided/. Answers do not persist."
      }
      surfaceId="S1+S2"
    >
      {fallback ? <MockFallbackBadge reason={fallback} /> : null}
      <QuestionnaireSurface questionnaire={questionnaire} />
    </PreviewPageShell>
  )
}
