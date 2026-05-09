// Auth.js v5 catch-all route handler. Auth.js exposes a `handlers` object
// with GET and POST keys; Next.js App Router consumes those as named
// exports from this route file.

import { handlers } from "@/lib/auth.server"

export const { GET, POST } = handlers
