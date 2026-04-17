import { promises as fs } from "fs"
import path from "path"
import { BenchDashboard } from "@/components/bench-dashboard"

async function readJson(filename: string) {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), filename), "utf-8")
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function getInitialIndex() {
  const index = await readJson("data/bench/index.json")
  if (!index) return null

  // Load comparison files — these surface the portfolio-level strategy question
  // (HODL vs binary vs graduated etc.) that the parameter sweep doesn't answer.
  const comparisons: unknown[] = []
  try {
    const compDir = path.join(process.cwd(), "data/bench/comparisons")
    const files = await fs.readdir(compDir)
    for (const f of files.filter(f => f.endsWith(".json"))) {
      const data = await readJson(`data/bench/comparisons/${f}`)
      if (data) comparisons.push(data)
    }
  } catch { /* no comparisons dir yet */ }

  return { ...index, comparisons }
}

export default async function BenchPage() {
  const initialIndex = await getInitialIndex()
  return <BenchDashboard initialIndex={initialIndex} />
}
