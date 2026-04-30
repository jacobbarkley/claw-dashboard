// Spec edit surface — Phase D-implementation live wiring.
//
// Loads the idea + the active/pending spec for editing in the operator
// authoring form. The form's save / submit-for-approval actions hit the live
// PATCH /api/research/specs/[id] endpoint that landed with Phase E. Read of
// the spec uses ?spec_id=… so re-spec drafts (pending_spec_id) can be edited
// without colliding with the active spec.

import Link from "next/link"

import { LabSubNav } from "@/components/vires/lab/lab-sub-nav"
import { LabPhaseZeroShell } from "@/components/vires/lab/phase-zero-shell"
import { SpecEditClient } from "@/components/vires/lab/spec-edit-client"
import { specAuthoringEnabled } from "@/lib/feature-flags.server"
import { PHASE_1_DEFAULT_SCOPE } from "@/lib/research-lab-contracts"
import { loadIdeaById } from "@/lib/research-lab-ideas.server"
import { loadStrategySpecById, loadStrategySpecsForIdea } from "@/lib/research-lab-specs.server"

export const metadata = {
  title: "Vires Capital — Lab · Spec edit",
}

export default async function SpecEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ spec_id?: string }>
}) {
  if (!specAuthoringEnabled()) {
    return notFoundShell("Spec authoring is not enabled in this environment.")
  }

  const { id } = await params
  const { spec_id: specIdParam } = await searchParams
  const ideaId = decodeURIComponent(id)

  const idea = await loadIdeaById(ideaId)
  if (!idea) return notFoundShell(`No idea found for ${ideaId}.`)

  const targetSpecId =
    specIdParam ??
    idea.strategy_ref.pending_spec_id ??
    idea.strategy_ref.active_spec_id ??
    null
  if (!targetSpecId) {
    return notFoundShell("This idea has no strategy spec yet. Author one from the idea page first.")
  }

  const spec = (await loadStrategySpecById(targetSpecId)) ??
    (await loadStrategySpecsForIdea(idea.idea_id)).find(s => s.spec_id === targetSpecId) ??
    null
  if (!spec) return notFoundShell(`No spec found for ${targetSpecId}.`)

  if (spec.idea_id !== idea.idea_id) {
    return notFoundShell("Spec does not belong to this idea.")
  }

  const ideaHref = `/vires/bench/lab/ideas/${encodeURIComponent(idea.idea_id)}`

  return (
    <>
      <LabSubNav />
      <div style={{ padding: "20px 20px 12px", maxWidth: 760, margin: "0 auto" }}>
        <Link
          href={ideaHref}
          className="t-eyebrow"
          style={{
            fontSize: 9,
            color: "var(--vr-cream-mute)",
            letterSpacing: "0.14em",
            textDecoration: "none",
            display: "inline-block",
            marginBottom: 10,
          }}
        >
          ← back to idea
        </Link>
        <h1
          style={{
            margin: 0,
            fontSize: 24,
            lineHeight: 1.15,
            color: "var(--vr-cream)",
            fontFamily: "var(--ff-serif)",
            fontStyle: "italic",
            fontWeight: 400,
          }}
        >
          Strategy spec
        </h1>
        <div
          className="t-mono"
          style={{
            marginTop: 6,
            fontSize: 11,
            color: "var(--vr-cream-mute)",
          }}
        >
          {spec.spec_id} · v{spec.spec_version}
        </div>
      </div>
      <div style={{ padding: "0 20px 120px", maxWidth: 760, margin: "0 auto" }}>
        <SpecEditClient
          idea={{
            idea_id: idea.idea_id,
            title: idea.title,
            thesis: idea.thesis,
            sleeve: idea.sleeve,
          }}
          spec={spec}
          scope={PHASE_1_DEFAULT_SCOPE}
          ideaHref={ideaHref}
        />
      </div>
    </>
  )
}

function notFoundShell(message: string) {
  return (
    <>
      <LabSubNav />
      <LabPhaseZeroShell
        eyebrow="Spec"
        title="Not available"
        subsection={message}
        pitch="Return to the idea page to author a spec, or check the URL."
      />
    </>
  )
}
