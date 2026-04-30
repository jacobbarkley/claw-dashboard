import { promises as fs } from "fs"
import path from "path"

import type { ResearchSleeve } from "@/lib/research-lab-contracts"
import { readDashboardFileText } from "@/lib/github-multi-file-commit.server"

export type DataCapabilityCategory =
  | "Price OHLCV"
  | "Fundamentals"
  | "Options chain"
  | "Implied vol surface"
  | "Sentiment"
  | "Attention proxies"
  | "Macro"
  | "Crypto on-chain"
  | "Custom"

export type DataCapabilityStatus =
  | "AVAILABLE"
  | "PARTIAL"
  | "PLANNED"
  | "UNAVAILABLE"

export interface DataCapabilityV1 {
  capability_id: string
  display_name: string
  category: DataCapabilityCategory
  status: DataCapabilityStatus
  sleeves: ResearchSleeve[]
  asof_coverage?: string | null
  notes?: string | null
}

export interface DataCapabilityCatalogV1 {
  schema_version: "research_lab.data_capability.v1"
  catalog_version: string
  generated_at: string
  doc?: string
  capabilities: DataCapabilityV1[]
}

export type DataReadinessVerdict = "PASS" | "WARN" | "BLOCKED"
export type DataRequirementStatus = "AVAILABLE" | "PARTIAL" | "MISSING"

export interface ModelDataRequirement {
  requested: string
  core?: boolean | null
  status?: DataRequirementStatus | null
  matched_capability?: string | null
  notes?: string | null
}

export interface DataReadinessRequirement {
  requested: string
  core: boolean
  status: DataRequirementStatus
  source?: string | null
  notes?: string | null
}

export interface DataReadinessAssessment {
  verdict: DataReadinessVerdict
  catalog_version: string
  requirements: DataReadinessRequirement[]
  warnings: string[]
  blocking_summary?: string
  suggested_action?: string
  discrepancies: string[]
}

const CATALOG_RELPATH = "data/research_lab/data_capability_catalog.json"
const VALID_CATEGORIES = new Set<DataCapabilityCategory>([
  "Price OHLCV",
  "Fundamentals",
  "Options chain",
  "Implied vol surface",
  "Sentiment",
  "Attention proxies",
  "Macro",
  "Crypto on-chain",
  "Custom",
])
const VALID_STATUSES = new Set<DataCapabilityStatus>([
  "AVAILABLE",
  "PARTIAL",
  "PLANNED",
  "UNAVAILABLE",
])
const VALID_SLEEVES = new Set<ResearchSleeve>(["STOCKS", "CRYPTO", "OPTIONS"])

export async function loadDataCapabilityCatalog(): Promise<DataCapabilityCatalogV1> {
  const raw = await readCatalogText()
  if (!raw) {
    throw new Error(`Data capability catalog not found at ${CATALOG_RELPATH}`)
  }
  const parsed = JSON.parse(raw) as unknown
  return normalizeCatalog(parsed)
}

export function assessDataReadiness({
  catalog,
  sleeve,
  requirements,
}: {
  catalog: DataCapabilityCatalogV1
  sleeve: ResearchSleeve
  requirements: ModelDataRequirement[]
}): DataReadinessAssessment {
  const byId = new Map(catalog.capabilities.map(capability => [capability.capability_id, capability]))
  const discrepancies: string[] = []
  const resolved = requirements.map((requirement, index) => {
    const requested = requirement.requested?.trim() || `requirement_${index + 1}`
    const claimedSource = requirement.matched_capability?.trim() || null
    const claimedStatus = requirement.status ?? null
    const capability = claimedSource ? byId.get(claimedSource) ?? null : null
    const categoryMismatch = capability && !capabilityMatchesRequest(capability, requested)
    let status: DataRequirementStatus = "MISSING"
    let source: string | null = null
    let notes = requirement.notes?.trim() || null

    if (!capability) {
      notes ??= claimedSource
        ? `No catalog entry matched ${claimedSource}.`
        : "No catalog capability matched this requirement."
    } else if (categoryMismatch) {
      notes =
        `Capability ${capability.capability_id} is ${capability.category}, ` +
        `which does not satisfy requested data ${requested}.`
    } else if (!capability.sleeves.includes(sleeve)) {
      notes ??= `${capability.display_name} is not wired for the ${sleeve.toLowerCase()} sleeve.`
    } else if (capability.status === "AVAILABLE") {
      status = "AVAILABLE"
      source = capability.capability_id
      notes ??= capability.notes ?? null
    } else if (capability.status === "PARTIAL") {
      status = "PARTIAL"
      source = capability.capability_id
      notes ??= capability.notes ?? null
    } else {
      notes ??= capability.notes ?? `${capability.display_name} is ${capability.status.toLowerCase()}.`
    }

    if (claimedStatus && claimedStatus !== status) {
      discrepancies.push(
        `${requested}: model claimed ${claimedStatus}, server resolved ${status}` +
          (source ? ` via ${source}` : ""),
      )
    }

    return {
      requested,
      core: requirement.core !== false,
      status,
      source,
      notes,
    }
  })

  const coreMissing = resolved.filter(req => req.core && req.status === "MISSING")
  const caveats = resolved.filter(req => req.status === "PARTIAL" || req.status === "MISSING")
  const verdict: DataReadinessVerdict = coreMissing.length
    ? "BLOCKED"
    : caveats.length
      ? "WARN"
      : "PASS"
  const warnings = caveats.map(formatRequirementCaveat)
  const blockingSummary = coreMissing.length
    ? `Strategy requires unavailable data: ${coreMissing.map(req => req.requested).join(", ")}.`
    : undefined

  return {
    verdict,
    catalog_version: catalog.catalog_version,
    requirements: resolved,
    warnings,
    blocking_summary: blockingSummary,
    suggested_action: coreMissing.length
      ? "Add or wire the missing data connector, or re-thesis the idea so the core signal uses available data."
      : undefined,
    discrepancies,
  }
}

export function capabilityMatchesRequest(capability: DataCapabilityV1, requested: string): boolean {
  const normalized = normalizeRequirement(requested)
  const category = capability.category
  if (normalized === normalizeRequirement(category)) return true
  const aliases: Record<string, DataCapabilityCategory[]> = {
    "price ohlcv": ["Price OHLCV"],
    ohlcv: ["Price OHLCV"],
    price: ["Price OHLCV"],
    fundamentals: ["Fundamentals"],
    "options chain": ["Options chain"],
    options: ["Options chain"],
    "implied vol surface": ["Implied vol surface"],
    "iv surface": ["Implied vol surface"],
    sentiment: ["Sentiment"],
    "attention proxies": ["Attention proxies"],
    attention: ["Attention proxies"],
    macro: ["Macro"],
    "crypto on-chain": ["Crypto on-chain"],
    onchain: ["Crypto on-chain"],
    "on-chain": ["Crypto on-chain"],
  }
  const allowed = aliases[normalized]
  if (!allowed) {
    return [
      capability.capability_id,
      capability.display_name,
      capability.category,
    ].some(label => {
      const normalizedLabel = normalizeRequirement(label)
      return normalizedLabel.includes(normalized) || normalized.includes(normalizedLabel)
    })
  }
  return allowed.includes(category)
}

function normalizeRequirement(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

export function dataReadinessForResponse(assessment: DataReadinessAssessment) {
  return {
    verdict: assessment.verdict,
    catalog_version: assessment.catalog_version,
    requirements: assessment.requirements.map(req => ({
      requested: req.requested,
      status: req.status,
      source: req.source ?? null,
      notes: req.notes ?? null,
    })),
    warnings: assessment.warnings,
    ...(assessment.blocking_summary ? { blocking_summary: assessment.blocking_summary } : {}),
    ...(assessment.suggested_action ? { suggested_action: assessment.suggested_action } : {}),
  }
}

function formatRequirementCaveat(requirement: DataReadinessRequirement): string {
  const source = requirement.source ? ` (${requirement.source})` : ""
  const note = requirement.notes ? ` - ${requirement.notes}` : ""
  return `${requirement.requested}: ${requirement.status}${source}${note}`
}

async function readCatalogText(): Promise<string | null> {
  const raw = await readDashboardFileText(CATALOG_RELPATH)
  if (raw) return raw
  try {
    return await fs.readFile(path.join(process.cwd(), CATALOG_RELPATH), "utf-8")
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null
    throw err
  }
}

function normalizeCatalog(parsed: unknown): DataCapabilityCatalogV1 {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Data capability catalog must be a JSON object")
  }
  const raw = parsed as Record<string, unknown>
  if (raw.schema_version !== "research_lab.data_capability.v1") {
    throw new Error("Data capability catalog schema_version must be research_lab.data_capability.v1")
  }
  if (typeof raw.catalog_version !== "string" || !raw.catalog_version.trim()) {
    throw new Error("Data capability catalog requires catalog_version")
  }
  if (typeof raw.generated_at !== "string" || !raw.generated_at.trim()) {
    throw new Error("Data capability catalog requires generated_at")
  }
  if (!Array.isArray(raw.capabilities) || raw.capabilities.length === 0) {
    throw new Error("Data capability catalog requires at least one capability")
  }
  const ids = new Set<string>()
  const capabilities = raw.capabilities.map((capability, index) => {
    if (!capability || typeof capability !== "object") {
      throw new Error(`capabilities[${index}] must be an object`)
    }
    const c = capability as Record<string, unknown>
    const capabilityId = requiredCatalogString(c.capability_id, `capabilities[${index}].capability_id`)
    if (ids.has(capabilityId)) throw new Error(`Duplicate data capability_id: ${capabilityId}`)
    ids.add(capabilityId)
    const category = requiredCatalogString(c.category, `capabilities[${index}].category`)
    if (!VALID_CATEGORIES.has(category as DataCapabilityCategory)) {
      throw new Error(`Invalid category for ${capabilityId}: ${category}`)
    }
    const status = requiredCatalogString(c.status, `capabilities[${index}].status`)
    if (!VALID_STATUSES.has(status as DataCapabilityStatus)) {
      throw new Error(`Invalid status for ${capabilityId}: ${status}`)
    }
    if (!Array.isArray(c.sleeves) || c.sleeves.length === 0) {
      throw new Error(`Capability ${capabilityId} requires sleeves`)
    }
    const sleeves = c.sleeves.map((sleeve, sleeveIndex) => {
      const normalized = requiredCatalogString(sleeve, `capabilities[${index}].sleeves[${sleeveIndex}]`)
      if (!VALID_SLEEVES.has(normalized as ResearchSleeve)) {
        throw new Error(`Invalid sleeve for ${capabilityId}: ${normalized}`)
      }
      return normalized as ResearchSleeve
    })
    return {
      capability_id: capabilityId,
      display_name: requiredCatalogString(c.display_name, `capabilities[${index}].display_name`),
      category: category as DataCapabilityCategory,
      status: status as DataCapabilityStatus,
      sleeves,
      asof_coverage: typeof c.asof_coverage === "string" ? c.asof_coverage : null,
      notes: typeof c.notes === "string" ? c.notes : null,
    }
  })
  return {
    schema_version: "research_lab.data_capability.v1",
    catalog_version: raw.catalog_version,
    generated_at: raw.generated_at,
    doc: typeof raw.doc === "string" ? raw.doc : undefined,
    capabilities,
  }
}

function requiredCatalogString(input: unknown, label: string): string {
  if (typeof input !== "string" || !input.trim()) {
    throw new Error(`${label} required`)
  }
  return input.trim()
}
