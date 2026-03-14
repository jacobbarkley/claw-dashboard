import { promises as fs } from "fs"
import path from "path"
import { TunablesPageClient } from "@/components/tunables-page"

async function getTradingData() {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), "data/trading.json"), "utf-8")
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export default async function TunablesPage() {
  const data = await getTradingData()
  return <TunablesPageClient initialData={data} />
}
