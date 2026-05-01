import { promises as fs } from "fs"
import path from "path"
import yaml from "js-yaml"

import type {
  PresetIndexV1,
  PresetV1,
  ReferenceStrategy,
} from "./research-lab-contracts"

const PRESETS_DIR = path.join(process.cwd(), "data", "research_lab", "presets")
const INDEX_PATH = path.join(PRESETS_DIR, "_index.json")
const SAFE_STRATEGY_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/
const MAX_REFERENCE_STRATEGIES = 2
const MAX_DELTA_NOTE_LENGTH = 280

async function loadPresetIndexRaw(): Promise<PresetIndexV1 | null> {
  try {
    const raw = await fs.readFile(INDEX_PATH, "utf-8")
    return JSON.parse(raw) as PresetIndexV1
  } catch {
    return null
  }
}

async function loadPresetYamlFromIndexEntry(entry: PresetIndexV1["presets"][number]): Promise<PresetV1 | null> {
  try {
    const raw = await fs.readFile(path.join(PRESETS_DIR, path.basename(entry.path)), "utf-8")
    const parsed = yaml.load(raw)
    return parsed && typeof parsed === "object" ? parsed as PresetV1 : null
  } catch {
    return null
  }
}

export async function loadRegisteredStrategyIds(): Promise<Set<string>> {
  const index = await loadPresetIndexRaw()
  const ids = new Set<string>()
  for (const preset of index?.presets ?? []) {
    if (preset.strategy_id) ids.add(preset.strategy_id)
  }
  return ids
}

export function normalizeReferenceStrategies(
  input: unknown,
  registeredStrategies: Set<string>,
): ReferenceStrategy[] {
  if (input == null) return []
  if (!Array.isArray(input)) {
    throw new Error("reference_strategies must be an array")
  }
  if (input.length > MAX_REFERENCE_STRATEGIES) {
    throw new Error(`reference_strategies accepts at most ${MAX_REFERENCE_STRATEGIES} entries`)
  }

  const seen = new Set<string>()
  const refs: ReferenceStrategy[] = []
  for (const item of input) {
    if (!item || typeof item !== "object") {
      throw new Error("each reference strategy must be an object")
    }
    const raw = item as Record<string, unknown>
    const strategyId = typeof raw.strategy_id === "string" ? raw.strategy_id.trim() : ""
    if (!strategyId || !SAFE_STRATEGY_ID.test(strategyId)) {
      throw new Error("reference_strategies[].strategy_id must be a safe registered strategy id")
    }
    if (seen.has(strategyId)) {
      throw new Error(`duplicate reference strategy "${strategyId}"`)
    }
    if (registeredStrategies.size > 0 && !registeredStrategies.has(strategyId)) {
      throw new Error(`reference strategy "${strategyId}" is not registered`)
    }
    const deltaNote = typeof raw.delta_note === "string" ? raw.delta_note.trim() : ""
    if (deltaNote.length > MAX_DELTA_NOTE_LENGTH) {
      throw new Error(`reference strategy "${strategyId}" delta_note must be ${MAX_DELTA_NOTE_LENGTH} chars or less`)
    }
    seen.add(strategyId)
    refs.push({
      strategy_id: strategyId,
      delta_note: deltaNote || null,
    })
  }
  return refs
}

export async function formatReferenceStrategiesForPrompt(
  references: ReferenceStrategy[] | null | undefined,
): Promise<string> {
  if (!references?.length) {
    return "Reference strategies: none. Treat this as a blank-slate strategy idea."
  }

  const index = await loadPresetIndexRaw()
  if (!index) {
    return [
      "Reference strategies were supplied, but the preset index is unavailable.",
      "Use the operator's delta notes as lineage hints only; do not invent parent implementation details.",
      ...references.map(ref => `- ${ref.strategy_id}${ref.delta_note ? `: ${ref.delta_note}` : ""}`),
    ].join("\n")
  }

  const sections = await Promise.all(references.map(async ref => {
    const entries = index.presets.filter(preset => preset.strategy_id === ref.strategy_id)
    const hydrated = await Promise.all(entries.slice(0, 3).map(loadPresetYamlFromIndexEntry))
    const presets = hydrated.filter((preset): preset is PresetV1 => preset != null)
    const firstEntry = entries[0]
    const lines = [
      `Parent strategy: ${ref.strategy_id}`,
      `Operator delta note: ${ref.delta_note || "(none supplied)"}`,
      `Registry family: ${firstEntry?.strategy_family ?? "(unknown)"}`,
      `Sleeve: ${firstEntry?.sleeve ?? "(unknown)"}`,
    ]

    if (presets.length) {
      lines.push("Known executable presets:")
      for (const preset of presets) {
        lines.push(`- ${preset.preset_id}: ${preset.description}`)
        lines.push(`  source_registry_preset_id: ${preset.source_registry_preset_id}`)
        lines.push(`  param_schema keys: ${Object.keys(preset.param_schema ?? {}).join(", ") || "(none)"}`)
        lines.push(`  base_experiment: ${truncate(JSON.stringify(preset.base_experiment ?? {}), 700)}`)
      }
    } else if (entries.length) {
      lines.push("Known executable presets:")
      for (const entry of entries.slice(0, 3)) {
        lines.push(`- ${entry.preset_id}: ${entry.display_name}`)
      }
    } else {
      lines.push("Registry lookup: missing from mirrored preset index. Keep lineage but ask for clarification if this parent is essential.")
    }

    return lines.join("\n")
  }))

  return [
    "Reference strategies are parent/context only. Draft NEW code for this idea; do not route to the parent strategy as-is.",
    ...sections,
  ].join("\n\n")
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value
}
