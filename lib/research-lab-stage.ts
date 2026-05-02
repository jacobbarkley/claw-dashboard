// Idea stage derivation for the Lab redesign.
//
// The prototype's stage taxonomy (thesis / spec / build / job / campaign /
// promoted) maps onto fields we already track on IdeaArtifact + a single
// "does a lab campaign exist for this idea" lookup. No per-idea spec read.

import type { IdeaArtifact } from "./research-lab-contracts"

export const STAGES = ["thesis", "spec", "build", "job", "campaign", "promoted"] as const
export type IdeaStage = (typeof STAGES)[number]

export interface StageMeta {
  key: IdeaStage
  label: string
}

export const STAGE_META: Record<IdeaStage, StageMeta> = {
  thesis:    { key: "thesis",    label: "Thesis"   },
  spec:      { key: "spec",      label: "Spec"     },
  build:     { key: "build",     label: "Build"    },
  job:       { key: "job",       label: "Job"      },
  campaign:  { key: "campaign",  label: "Campaign" },
  promoted:  { key: "promoted",  label: "Promoted" },
}

export function stageIndex(stage: IdeaStage): number {
  return STAGES.indexOf(stage)
}

export function stageColor(stage: IdeaStage): string {
  if (stage === "promoted") return "var(--vr-up)"
  if (stage === "campaign" || stage === "job") return "var(--vr-gold)"
  if (stage === "spec" || stage === "build") return "var(--vr-gold)"
  return "var(--vr-cream-mute)"
}

export function deriveIdeaStage(
  idea: IdeaArtifact,
  ctx: { hasCampaign: boolean },
): IdeaStage {
  // Promoted lookup needs passport-binding context; defer until that crawl
  // lands. For now, an idea that has graduated to a campaign and is no
  // longer being iterated stays at "campaign".
  if (ctx.hasCampaign) return "campaign"
  if (idea.code_pending) return "thesis"
  const hasSpec = Boolean(idea.strategy_ref?.active_spec_id)
  if (idea.status === "ACTIVE" || idea.status === "QUEUED") return "job"
  if (idea.status === "READY") return "build"
  if (hasSpec) return "spec"
  return "thesis"
}
