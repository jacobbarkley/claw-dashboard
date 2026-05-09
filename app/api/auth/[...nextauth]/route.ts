// Auth.js v5 dynamic route handler. Destructures the handlers from the
// centralized config in lib/auth.server.ts.

import { handlers } from "@/lib/auth.server"

export const { GET, POST } = handlers
