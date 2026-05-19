import type { NextRequest } from "next/server"

import { handleGuidedCommandRoute } from "@/lib/guided-command-route.server"
import { ResumeEnrollmentPayloadSchema } from "@/lib/guided-exit.schemas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest): Promise<Response> {
  return handleGuidedCommandRoute(request, {
    commandName: "resume_enrollment",
    payloadSchema: ResumeEnrollmentPayloadSchema,
    defaultNextPath: "/vires/guided/preview/active",
  })
}
