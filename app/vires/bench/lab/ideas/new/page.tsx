import { promises as fs } from "fs"
import path from "path"

import { LabSubNav } from "@/components/vires/lab/lab-sub-nav"
import { IdeaForm, type StrategyOption } from "@/components/vires/lab/idea-form"
import type { ResearchSleeve } from "@/lib/research-lab-contracts"

export const metadata = {
  title: "Vires Capital — Lab · New Idea",
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

export default async function ViresLabNewIdeaPage() {
  const strategyOptions = await loadPresetIndex()

  return (
    <>
      <LabSubNav />
      <div style={{ padding: "24px 20px 12px", maxWidth: 640, margin: "0 auto" }}>
        <div
          className="t-eyebrow"
          style={{ fontSize: 10, color: "var(--vr-gold)", marginBottom: 10, letterSpacing: "0.14em" }}
        >
          New idea
        </div>
        <h1
          className="t-display"
          style={{
            margin: 0,
            fontSize: 26,
            lineHeight: 1.15,
            color: "var(--vr-cream)",
            fontWeight: 400,
          }}
        >
          Shape something worth testing
        </h1>
        <p
          style={{
            marginTop: 10,
            fontSize: 12.5,
            lineHeight: 1.55,
            color: "var(--vr-cream-mute)",
          }}
        >
          Save a thesis against a registered strategy. DRAFT stays quiet; READY makes the idea
          eligible for jobs and autopilot pickup.
        </p>
      </div>
      <div style={{ padding: "0 20px 120px", maxWidth: 640, margin: "0 auto" }}>
        <IdeaForm strategyOptions={strategyOptions} />
      </div>
    </>
  )
}
