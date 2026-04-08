import { promises as fs } from "fs"
import path from "path"
import { QueuePanel } from "@/components/queue-panel"

async function readJson(filename: string) {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), filename), "utf-8")
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export default async function QueuePage() {
  const data = await readJson("data/queue.json")
  const operatorData = await readJson("data/operator-feed.json")
  return <QueuePanel data={data} operatorData={operatorData} />
}
