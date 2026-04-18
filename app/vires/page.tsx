import { promises as fs } from "fs"
import path from "path"
import { ViresTradingHome } from "@/components/vires/trading-home"

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
  title: "Vires Capital — Preview",
}

export default async function ViresPreviewPage() {
  const data = await getInitialData()
  return <ViresTradingHome data={data} />
}
