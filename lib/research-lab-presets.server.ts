// Server-side loader for Research Lab presets.
//
// The preset bundle is authored on trading-bot side and mirrored into
// `data/research_lab/presets/` here. Each preset YAML carries the
// canonical param_schema + bounds the submit form picks against.
//
// Source of truth for shapes: lib/research-lab-contracts.PresetV1 +
// PresetIndexV1.

import { promises as fs } from "fs"
import path from "path"
import yaml from "js-yaml"

import type {
  PresetIndexV1,
  PresetV1,
  ResearchSleeve,
} from "./research-lab-contracts"

const PRESETS_DIR = path.join(process.cwd(), "data", "research_lab", "presets")
const INDEX_PATH = path.join(PRESETS_DIR, "_index.json")

async function readJsonIfPresent<T>(absPath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(absPath, "utf-8")
    return JSON.parse(raw) as T
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null
    console.error(`[research-lab-presets] failed to read ${absPath}:`, err)
    return null
  }
}

async function readYamlIfPresent<T>(absPath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(absPath, "utf-8")
    const parsed = yaml.load(raw)
    if (parsed && typeof parsed === "object") return parsed as T
    return null
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null
    console.error(`[research-lab-presets] failed to read ${absPath}:`, err)
    return null
  }
}

export async function loadPresetIndex(): Promise<PresetIndexV1 | null> {
  return readJsonIfPresent<PresetIndexV1>(INDEX_PATH)
}

export async function loadPresetById(presetId: string): Promise<PresetV1 | null> {
  const index = await loadPresetIndex()
  if (!index) return null
  const entry = index.presets.find(p => p.preset_id === presetId)
  if (!entry) return null
  // Index path is relative to the trading-bot repo root; in the dashboard
  // mirror the YAMLs sit under data/research_lab/presets/<basename>.
  const absPath = path.join(PRESETS_DIR, path.basename(entry.path))
  return readYamlIfPresent<PresetV1>(absPath)
}

// Filter presets by strategy_id (canonical join). Falls back to sleeve when
// strategy_id has no matches — useful when an idea points at a strategy_id
// that hasn't been registered yet, but the operator still wants to see what
// presets exist for the sleeve.
export async function loadPresetsForStrategy(
  strategyId: string,
  sleeve: ResearchSleeve | null = null,
): Promise<PresetV1[]> {
  const index = await loadPresetIndex()
  if (!index) return []
  const matches = index.presets.filter(p => p.strategy_id === strategyId)
  const entries = matches.length > 0 ? matches : index.presets.filter(p => sleeve && p.sleeve === sleeve)
  const presets = await Promise.all(
    entries.map(async entry => {
      const absPath = path.join(PRESETS_DIR, path.basename(entry.path))
      return readYamlIfPresent<PresetV1>(absPath)
    }),
  )
  return presets.filter((p): p is PresetV1 => p != null)
}
