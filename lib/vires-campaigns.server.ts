import { promises as fs } from "fs"
import path from "path"

import type {
  CampaignManifest,
  CampaignRegistry,
  CampaignRegistryEntry,
  CampaignsIndexData,
} from "./vires-campaigns"

// Server-only loaders for the Bench Campaigns surface. Lives separately from
// the shared types + pure utils in `./vires-campaigns.ts` so client
// components can import types without pulling Node's fs into the bundle.

const CAMPAIGNS_DIR = path.join(process.cwd(), "data", "bench", "campaigns")
const REGISTRY_PATH = path.join(CAMPAIGNS_DIR, "campaign_registry.json")

async function readJson<T>(absolutePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(absolutePath, "utf-8")
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

// Resolve a manifest path against both the stated location and the dashboard
// mirror directory. The producer (trading-bot) writes its canonical path
// (`backtest/bench/campaigns/foo.json`); the dashboard mirrors files next to
// the registry at `data/bench/campaigns/foo.json`. Try the stated path first
// so local trading-bot dev still works, then fall back to the mirror.
function candidateManifestPaths(entry: CampaignRegistryEntry): string[] {
  const stated = path.isAbsolute(entry.manifest_path)
    ? entry.manifest_path
    : path.join(process.cwd(), entry.manifest_path)
  const mirror = path.join(CAMPAIGNS_DIR, path.basename(entry.manifest_path))
  return stated === mirror ? [stated] : [stated, mirror]
}

async function readManifest(entry: CampaignRegistryEntry): Promise<CampaignManifest | null> {
  for (const candidate of candidateManifestPaths(entry)) {
    const manifest = await readJson<CampaignManifest>(candidate)
    if (manifest) return manifest
  }
  return null
}

export async function loadCampaignsIndex(): Promise<CampaignsIndexData | null> {
  const registry = await readJson<CampaignRegistry>(REGISTRY_PATH)
  if (!registry) return null

  const manifests = await Promise.all(registry.campaigns.map(readManifest))

  const campaigns = manifests.filter((m): m is CampaignManifest => m != null)
  return { registry, campaigns }
}

export async function loadCampaignById(campaignId: string): Promise<CampaignManifest | null> {
  const index = await loadCampaignsIndex()
  if (!index) return null
  return index.campaigns.find(c => c.campaign_id === campaignId) ?? null
}
