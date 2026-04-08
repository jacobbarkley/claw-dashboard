import { promises as fs } from "fs"
import path from "path"
import { TradingDashboard } from "@/components/trading-dashboard"

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

export default async function TradingPage() {
  const initialData = await getInitialData()
  return <TradingDashboard initialData={initialData} />
}