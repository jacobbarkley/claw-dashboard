import type { NextRequest } from "next/server"

import { handleGuidedCommandRoute } from "@/lib/guided-command-route.server"
import { AcceptMatchPayloadSchema } from "@/lib/guided-accept-match.schemas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest): Promise<Response> {
  return handleGuidedCommandRoute(request, {
    commandName: "accept_match",
    payloadSchema: AcceptMatchPayloadSchema,
    // On accept, proposal transitions to ACCEPTED and the user moves to
    // the S4 disclosure surface. Backend may also write/transition other
    // artifacts; this is just the dashboard navigation target.
    defaultNextPath: "/vires/guided/preview/disclosure",
  })
}
