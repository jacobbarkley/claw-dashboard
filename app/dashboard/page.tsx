import { promises as fs } from "fs"
import path from "path"
import { TicketDashboard } from "@/components/ticket-dashboard"

async function getTicketData() {
  try {
    const filePath = path.join(process.cwd(), "data/tickets.json")
    const raw = await fs.readFile(filePath, "utf-8")
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export default async function DashboardPage() {
  const data = await getTicketData()
  return <TicketDashboard data={data} />
}
