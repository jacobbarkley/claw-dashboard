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
  return await readJson("data/bench/index.json")
}

export default async function BenchPage() {
  const initialIndex = await getInitialIndex()
  return <BenchDashboard initialIndex={initialIndex} />
}
