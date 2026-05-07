import { QuestionnaireSurface } from "@/components/vires/guided/questionnaire-surface"
import { PreviewPageShell } from "@/components/vires/guided/shared"
import { MOCK_QUESTIONNAIRE_V1 } from "@/components/vires/guided/mocks"

export default function GuidedQuestionnairePreview() {
  return (
    <PreviewPageShell
      title="Questionnaire"
      subtitle="S1 + S2 mocked. Reads from questionnaire.v1 mock fixture. Answers do not persist."
      surfaceId="S1+S2"
    >
      <QuestionnaireSurface questionnaire={MOCK_QUESTIONNAIRE_V1} />
    </PreviewPageShell>
  )
}
