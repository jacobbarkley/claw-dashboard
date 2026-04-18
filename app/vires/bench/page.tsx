import { promises as fs } from "fs"
import path from "path"
import { ViresBenchView } from "@/components/vires/bench-view"
import { loadBenchIndexWithViresContracts } from "@/lib/vires-bench"

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

export const metadata = {
  title: "Vires Capital — Bench",
}

export default async function ViresBenchPage() {
  const [benchData, operator] = await Promise.all([getInitialBench(), getOperator()])
  return <ViresBenchView benchData={benchData} operator={operator} />
}
