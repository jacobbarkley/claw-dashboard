import Link from "next/link"
import { notFound } from "next/navigation"

import { LabSubNav } from "@/components/vires/lab/lab-sub-nav"
import { LabPhaseZeroShell } from "@/components/vires/lab/phase-zero-shell"
import { UnifiedBuilderClient } from "@/components/vires/lab/unified-builder-client"
import { unifiedBuilderEnabled } from "@/lib/feature-flags.server"
import { loadIdeaById } from "@/lib/research-lab-ideas.server"
import { loadPresetStrategyOptions } from "@/lib/research-lab-presets.server"

export const metadata = {
  title: "Vires Capital — Lab · Builder",
}

export default async function ViresLabIdeaBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  if (!unifiedBuilderEnabled()) notFound()

  const { id } = await params
  const decoded = decodeURIComponent(id)
  const idea = await loadIdeaById(decoded)

  if (!idea) {
    return (
      <>
        <LabSubNav />
        <LabPhaseZeroShell
          eyebrow="Builder"
          title="Not found"
          subsection={decoded}
          pitch="No idea file under that id in this scope. Builder needs a saved idea to draft against."
        >
          <Link
            href="/vires/bench/lab/ideas"
            className="t-eyebrow"
            style={{
              marginTop: 14,
              padding: "7px 12px",
              fontSize: 10,
              letterSpacing: "0.14em",
              borderRadius: 3,
              border: "1px solid var(--vr-line)",
              color: "var(--vr-cream-mute)",
              textDecoration: "none",
              alignSelf: "flex-start",
              display: "inline-block",
            }}
          >
            Back to ideas
          </Link>
        </LabPhaseZeroShell>
      </>
    )
  }

  const strategyOptions = await loadPresetStrategyOptions()

  return (
    <>
      <LabSubNav />
      <UnifiedBuilderClient idea={idea} strategyOptions={strategyOptions} />
    </>
  )
}
