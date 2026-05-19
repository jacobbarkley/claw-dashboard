import type { NextRequest } from "next/server"

import { handleGuidedCommandRoute } from "@/lib/guided-command-route.server"
import { RetryBrokerSetupPayloadSchema } from "@/lib/guided-broker.schemas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest): Promise<Response> {
  return handleGuidedCommandRoute(request, {
    commandName: "retry_broker_setup",
    payloadSchema: RetryBrokerSetupPayloadSchema,
    // Retry triggers a re-check on the runtime side. After it lands,
    // the operator is usually walking back into the broker flow to
    // see the new state — /broker is the right next path.
    defaultNextPath: "/vires/guided/preview/broker",
  })
}
