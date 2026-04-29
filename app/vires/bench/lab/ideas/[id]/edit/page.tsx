import { promises as fs } from "fs"
import path from "path"
import Link from "next/link"

import { IdeaEditForm } from "@/components/vires/lab/idea-edit-form"
import type { StrategyOption } from "@/components/vires/lab/idea-form"
import { LabSubNav } from "@/components/vires/lab/lab-sub-nav"
import type { ResearchSleeve } from "@/lib/research-lab-contracts"
import { loadIdeaById } from "@/lib/research-lab-ideas.server"
import { hasLabCampaignForIdea } from "@/lib/vires-campaigns.server"

export const metadata = {
  title: "Vires Capital — Lab · Edit Idea",
}

interface PresetIndexEntry {
  preset_id: string
  display_name: string
  phase?: string
  sleeve?: string
  strategy_id: string
  strategy_family: string
  path?: string
}

async function loadPresetIndex(): Promise<StrategyOption[]> {
  try {
    const indexPath = path.join(process.cwd(), "data", "research_lab", "presets", "_index.json")
    const raw = await fs.readFile(indexPath, "utf-8")
    const parsed = JSON.parse(raw) as { presets?: PresetIndexEntry[] }
    const opts: StrategyOption[] = []
    const seen = new Set<string>()
    for (const p of parsed.presets ?? []) {
      if (!p.strategy_id || seen.has(p.strategy_id)) continue
      seen.add(p.strategy_id)
      opts.push({
        strategy_id: p.strategy_id,
        strategy_family: p.strategy_family,
        display_name: p.display_name,
        sleeve: ((p.sleeve ?? "STOCKS").toUpperCase() as ResearchSleeve),
        preset_id: p.preset_id,
      })
    }
    return opts
  } catch {
    return []
  }
}

export default async function ViresLabEditIdeaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ideaId = decodeURIComponent(id)
  const idea = await loadIdeaById(ideaId)

  if (!idea) {
    return (
      <>
        <LabSubNav />
        <NotEditableShell heading="Idea not found" body={`No idea on disk for "${ideaId}".`} />
      </>
    )
  }

  // Lock check parallel to backend: edits only allowed on DRAFT ideas
  // with no Lab campaign rolled up against them.
  if (idea.status !== "DRAFT") {
    return (
      <>
        <LabSubNav />
        <NotEditableShell
          heading="Locked"
          body={
            `This idea is ${idea.status}. Title, thesis, strategy and sleeve only edit while it's in DRAFT. ` +
            "Move it back to DRAFT first if you need to make changes."
          }
          ideaId={ideaId}
        />
      </>
    )
  }
  const labCampaignExists = await hasLabCampaignForIdea(ideaId)
  if (labCampaignExists) {
    return (
      <>
        <LabSubNav />
        <NotEditableShell
          heading="Locked"
          body={
            "A Lab campaign already exists for this idea, so its thesis and strategy are locked. " +
            "Create a new idea if you need different fundamentals."
          }
          ideaId={ideaId}
        />
      </>
    )
  }

  const strategyOptions = await loadPresetIndex()

  return (
    <>
      <LabSubNav />
      <div style={{ padding: "24px 20px 12px", maxWidth: 640, margin: "0 auto" }}>
        <h1
          style={{
            margin: 0,
            fontSize: 26,
            lineHeight: 1.15,
            color: "var(--vr-cream)",
            fontFamily: "var(--ff-serif)",
            fontStyle: "italic",
            fontWeight: 400,
          }}
        >
          Edit idea
        </h1>
        <p
          style={{
            marginTop: 8,
            fontSize: 12,
            color: "var(--vr-cream-mute)",
            lineHeight: 1.55,
          }}
        >
          Refine before releasing. Edits are saved as a single commit; the
          detail page reflects them after Vercel redeploys (~2 min).
        </p>
      </div>
      <div style={{ padding: "0 20px 120px", maxWidth: 640, margin: "0 auto" }}>
        <IdeaEditForm idea={idea} strategyOptions={strategyOptions} />
      </div>
    </>
  )
}

function NotEditableShell({
  heading,
  body,
  ideaId,
}: {
  heading: string
  body: string
  ideaId?: string
}) {
  return (
    <div style={{ padding: "24px 20px", maxWidth: 640, margin: "0 auto" }}>
      <h1
        style={{
          margin: 0,
          fontSize: 24,
          fontFamily: "var(--ff-serif)",
          fontStyle: "italic",
          color: "var(--vr-cream)",
          fontWeight: 400,
        }}
      >
        {heading}
      </h1>
      <p style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.55, color: "var(--vr-cream-mute)" }}>
        {body}
      </p>
      {ideaId && (
        <Link
          href={`/vires/bench/lab/ideas/${encodeURIComponent(ideaId)}`}
          style={{
            display: "inline-block",
            marginTop: 14,
            padding: "7px 12px",
            fontSize: 11,
            fontFamily: "var(--ff-mono)",
            color: "var(--vr-gold)",
            textDecoration: "none",
            border: "1px solid var(--vr-gold-line)",
            borderRadius: 3,
            background: "var(--vr-gold-soft)",
          }}
        >
          Back to idea →
        </Link>
      )}
    </div>
  )
}
