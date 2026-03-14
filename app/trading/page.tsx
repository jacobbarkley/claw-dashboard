import { promises as fs } from "fs"
import path from "path"
import { TradingDashboard } from "@/components/trading-dashboard"

async function getInitialData() {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), "data/trading.json"), "utf-8")
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export default async function TradingPage() {
  const initialData = await getInitialData()
  return <TradingDashboard initialData={initialData} />
}
