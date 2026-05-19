import type { NextRequest } from "next/server"

import { handleGuidedCommandRoute } from "@/lib/guided-command-route.server"
import { AcceptDisclosurePayloadSchema } from "@/lib/guided-accept-disclosure.schemas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest): Promise<Response> {
  return handleGuidedCommandRoute(request, {
    commandName: "accept_disclosure",
    payloadSchema: AcceptDisclosurePayloadSchema,
    defaultNextPath: "/vires/guided/preview/broker",
  })
}
