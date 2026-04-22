import { promises as fs } from "fs"
import path from "path"
import { ViresBenchView } from "@/components/vires/bench-view"
import { loadBenchIndexWithViresContracts } from "@/lib/vires-bench"
import { loadCampaignsIndex } from "@/lib/vires-campaigns.server"

async function readJson(filename: string) {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), filename), "utf-8")
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function getInitialBench() {
  return await loadBenchIndexWithViresContracts()
}

async function getOperator() {
  const feed = await readJson("data/operator-feed.json")
  return feed?.operator ?? null
}

async function getCampaignCount() {
  const campaigns = await loadCampaignsIndex()
  return campaigns?.registry?.campaigns?.length ?? 0
}

export const metadata = {
  title: "Vires Capital — Bench",
}

export default async function ViresBenchPage() {
  const [benchData, operator, campaignCount] = await Promise.all([
    getInitialBench(),
    getOperator(),
    getCampaignCount(),
  ])
  return <ViresBenchView benchData={benchData} operator={operator} campaignCount={campaignCount} />
}
