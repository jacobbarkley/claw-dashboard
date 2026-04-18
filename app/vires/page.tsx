import { promises as fs } from "fs"
import path from "path"
import { ViresTradingShell } from "@/components/vires/trading-shell"

// Server-side loader matches the existing /trading page so the new design
// reads the same operator-feed.json source of truth — no data forking.
async function readJson(filename: string) {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), filename), "utf-8")
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function getInitialData() {
  return (await readJson("data/operator-feed.json")) ?? (await readJson("data/trading.json"))
}

export const metadata = {
  title: "Vires Capital — Trading",
}

export default async function ViresTradingPage() {
  const data = await getInitialData()
  const operator = data?.operator ?? null
  return <ViresTradingShell data={data} operator={operator} />
}
