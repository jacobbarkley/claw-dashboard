import Link from "next/link"
import path from "path"
import { promises as fs } from "fs"
import yaml from "js-yaml"

import { LabSubNav } from "@/components/vires/lab/lab-sub-nav"
import { RunStrategyForm } from "@/components/vires/lab/run-strategy-form"
import { loadPresetIndex } from "@/lib/research-lab-presets.server"
import type { PresetV1, ResearchSleeve } from "@/lib/research-lab-contracts"

export const metadata = {
  title: "Vires Capital — Lab · Run a registered strategy",
}

const PRESETS_DIR = path.join(process.cwd(), "data", "research_lab", "presets")

async function readPresetYaml(relPath: string): Promise<PresetV1 | null> {
  try {
    const raw = await fs.readFile(path.join(PRESETS_DIR, path.basename(relPath)), "utf-8")
    const parsed = yaml.load(raw)
    return parsed && typeof parsed === "object" ? (parsed as PresetV1) : null
  } catch {
    return null
  }
}

export default async function ViresLabRunStrategyPage() {
  const index = await loadPresetIndex()
  const entries = index?.presets ?? []
  const presets = (
    await Promise.all(entries.map(entry => readPresetYaml(entry.path)))
  ).filter((p): p is PresetV1 => p != null)

  // Group by strategy_id for the strategy picker — one card per strategy,
  // even if multiple presets share that strategy_id.
  const byStrategy = new Map<string, { sleeve: ResearchSleeve; strategy_family: string; preset_count: number }>()
  for (const p of presets) {
    const existing = byStrategy.get(p.strategy_id)
    if (existing) {
      existing.preset_count += 1
    } else {
      byStrategy.set(p.strategy_id, {
        sleeve: p.sleeve,
        strategy_family: p.strategy_family,
        preset_count: 1,
      })
    }
  }
  const strategies = Array.from(byStrategy.entries())
    .map(([strategy_id, meta]) => ({
      strategy_id,
      strategy_family: meta.strategy_family,
      sleeve: meta.sleeve,
      preset_count: meta.preset_count,
    }))
    .sort((a, b) => a.sleeve.localeCompare(b.sleeve) || a.strategy_family.localeCompare(b.strategy_family))

  return (
    <>
      <LabSubNav />
      <div style={{ padding: "24px 20px 8px", maxWidth: 640, margin: "0 auto" }}>
        <div
          className="t-eyebrow"
          style={{ fontSize: 10, color: "var(--vr-gold)", marginBottom: 10, letterSpacing: "0.14em" }}
        >
          Run a registered strategy
        </div>
        <h1
          className="t-display"
          style={{ margin: 0, fontSize: 28, lineHeight: 1.15, color: "var(--vr-cream)", fontWeight: 400 }}
        >
          Pick a registered strategy and run it as-is
        </h1>
        <p style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.55, color: "var(--vr-cream-mute)" }}>
          Use this when you want to run an existing strategy without authoring a new spec. For
          new strategies derived from existing ones,{" "}
          <Link
            href="/vires/bench/lab/ideas/new"
            style={{ color: "var(--vr-gold)", textDecoration: "underline" }}
          >
            author a new idea
          </Link>
          {" "}instead.
        </p>
      </div>

      {strategies.length === 0 ? (
        <div style={{ padding: "20px 18px", maxWidth: 640, margin: "0 auto" }}>
          <div
            className="vr-card"
            style={{
              padding: "16px 18px",
              borderLeft: "2px solid var(--vr-cream-mute)",
              background: "transparent",
            }}
          >
            <div
              className="t-eyebrow"
              style={{ fontSize: 9, color: "var(--vr-cream-mute)", marginBottom: 5, letterSpacing: "0.14em" }}
            >
              No registered strategies
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--vr-cream-dim)" }}>
              The preset index is empty in this scope. Codex registers presets on the trading-bot
              side; once any preset is mirrored into{" "}
              <code style={{ fontFamily: "var(--ff-mono)" }}>data/research_lab/presets/</code>,
              this page will populate automatically.
            </div>
          </div>
        </div>
      ) : (
        <RunStrategyForm strategies={strategies} presets={presets} />
      )}
    </>
  )
}
