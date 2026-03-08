import { promises as fs } from "fs"
import path from "path"
import { QueuePanel } from "@/components/queue-panel"

async function getQueueData() {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), "data/queue.json"), "utf-8")
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export default async function QueuePage() {
  const data = await getQueueData()
  return <QueuePanel data={data} />
}
