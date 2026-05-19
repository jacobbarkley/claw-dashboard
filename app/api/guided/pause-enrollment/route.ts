import type { NextRequest } from "next/server"

import { handleGuidedCommandRoute } from "@/lib/guided-command-route.server"
import { PauseEnrollmentPayloadSchema } from "@/lib/guided-exit.schemas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest): Promise<Response> {
  return handleGuidedCommandRoute(request, {
    commandName: "pause_enrollment",
    payloadSchema: PauseEnrollmentPayloadSchema,
    defaultNextPath: "/vires/guided/preview/active",
  })
}
