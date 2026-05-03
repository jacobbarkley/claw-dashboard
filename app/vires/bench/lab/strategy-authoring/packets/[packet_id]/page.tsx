// Server entry for the Strategy Authoring Packet detail screen.
// Loads the lifecycle view directly via the server helper (no internal HTTP),
// passes initial state to the client. Client handles mutations via the
// PATCH endpoint Codex shipped (commit 8686c300).

import { notFound } from "next/navigation"

import { PacketDetailClient } from "@/components/vires/lab/strategy-authoring/packet-detail-client"
import { PHASE_1_DEFAULT_SCOPE } from "@/lib/research-lab-contracts"
import { loadPacketLifecycleView } from "@/lib/research-lab-strategy-authoring-lifecycle.server"

export const metadata = {
  title: "Vires Capital — Lab · Strategy Authoring Packet",
}

export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ packet_id: string }>
}

export default async function StrategyAuthoringPacketPage({ params }: PageProps) {
  const { packet_id } = await params
  const packetId = decodeURIComponent(packet_id)
  const scope = PHASE_1_DEFAULT_SCOPE
  const view = await loadPacketLifecycleView({ packetId, scope })
  if (!view) {
    notFound()
  }
  return <PacketDetailClient initialView={view} scope={scope} />
}
