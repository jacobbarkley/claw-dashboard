// Browser-safe typed mirror of data/guided/decline_questions.v1.json.
// Imported by both server route handlers (for validation) and client
// surfaces (for rendering). Generic questions, not strategy-derived;
// strategy-derived decline questions are a follow-up (see VIR-11 area).

import declineQuestionsRaw from "@/data/guided/decline_questions.v1.json"

export interface DeclineQuestionOption {
  option_id: string
  label: string
}

export interface DeclineQuestion {
  key: string
  sequence: number
  text: string
  answer_options: DeclineQuestionOption[]
}

export interface DeclineQuestionsBank {
  schema_version: "decline_questions.v1"
  decline_questions_id: string
  version: string
  title: string
  subtitle: string
  questions: DeclineQuestion[]
  open_ended_question: {
    key: string
    text: string
    placeholder: string
    max_length: number
  }
}

export const DECLINE_QUESTIONS: DeclineQuestionsBank = declineQuestionsRaw as DeclineQuestionsBank
