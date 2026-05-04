// Draft Strategy Authoring Packet — questionnaire form for an idea.
//
// The questionnaire is the full v1 contract (22 fields). Mode (Guided /
// Standard / Expert) controls how it's presented; the submission shape
// is identical across modes. Talon-defaultable fields ship pre-filled
// with TUNABLE_DEFAULT provenance until the operator overrides them.
//
// Behind VIRES_LAB_PACKET_AUTHORING. Old idea→spec lane stays intact.

import { notFound } from "next/navigation"

import { DraftPacketClient } from "@/components/vires/lab/strategy-authoring/draft-packet-client"
import { packetAuthoringEnabled } from "@/lib/feature-flags.server"
import { PHASE_1_DEFAULT_SCOPE } from "@/lib/research-lab-contracts"
import { loadIdeaById } from "@/lib/research-lab-ideas.server"

export const metadata = {
  title: "Vires Capital — Lab · Draft packet",
}

export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function DraftPacketPage({ params }: PageProps) {
  if (!packetAuthoringEnabled()) {
    notFound()
  }
  const { id } = await params
  const ideaId = decodeURIComponent(id)
  const scope = PHASE_1_DEFAULT_SCOPE
  const idea = await loadIdeaById(ideaId, scope)
  if (!idea) {
    notFound()
  }
  return <DraftPacketClient idea={idea} scope={scope} />
}
