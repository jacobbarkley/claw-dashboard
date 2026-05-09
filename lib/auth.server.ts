// Server-only Auth.js v5 setup for Guided Mode (T1.0d).
//
// Persistence policy (locked at T1.0a kickoff §2.7):
//   - Auth state ONLY (verification tokens, sessions, users, accounts) lives
//     in Upstash Redis via @auth/upstash-redis-adapter.
//   - Guided user-state (proposals, enrollments, views, events) NEVER lands
//     here. That store is owned by the vires-numeris private store at T1.0e.
//   - The dashboard imports zero database drivers for Guided state. Auth.js
//     happens to need a token store to issue magic links — that is the only
//     persistence this module touches.
//
// Provider: Resend HTTP API (Auth.js built-in). No nodemailer, no SMTP.
//
// Allowlist: AUTH_ALLOWED_EMAILS (comma-separated). The signIn callback
// rejects any address that is not on the list — this is the gate that keeps
// the magic-link flow from being a public sign-up form. Phase 6.2 the list
// holds Jacob's email only.
//
// Sessions: JWT strategy. The Upstash adapter is required by Auth.js for
// the email flow's verification-token store; sessions themselves are not
// persisted there.

import "server-only"

import NextAuth, { type NextAuthConfig } from "next-auth"
import Resend from "next-auth/providers/resend"
import { UpstashRedisAdapter } from "@auth/upstash-redis-adapter"
import { Redis } from "@upstash/redis"

// Module augmentation: persist the verified email through to runtime callers
// of `auth()`. Guided scope resolution reads `session.guidedEmail`.
declare module "next-auth" {
  interface Session {
    guidedEmail?: string
  }
}
declare module "@auth/core/jwt" {
  interface JWT {
    guidedEmail?: string
  }
}

export class AuthMisconfiguredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AuthMisconfiguredError"
  }
}

function readAllowedEmails(): Set<string> {
  const raw = process.env.AUTH_ALLOWED_EMAILS ?? ""
  const parsed = raw
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(s => s.length > 0)
  if (parsed.length === 0) {
    throw new AuthMisconfiguredError(
      "AUTH_ALLOWED_EMAILS is empty — the magic-link flow has no permitted recipients.",
    )
  }
  return new Set(parsed)
}

function buildAdapter() {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    throw new AuthMisconfiguredError(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for the auth-only token store.",
    )
  }
  return UpstashRedisAdapter(new Redis({ url, token }), { baseKeyPrefix: "guided-auth:" })
}

function buildResendProvider() {
  const apiKey = process.env.AUTH_RESEND_KEY
  if (!apiKey) {
    throw new AuthMisconfiguredError("AUTH_RESEND_KEY is required to send magic-link emails.")
  }
  const from = process.env.EMAIL_FROM
  if (!from) {
    throw new AuthMisconfiguredError("EMAIL_FROM is required (e.g. 'Vires <noreply@yourdomain>').")
  }
  return Resend({ apiKey, from })
}

const config: NextAuthConfig = {
  adapter: buildAdapter(),
  providers: [buildResendProvider()],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/signin",
    verifyRequest: "/signin/verify",
  },
  callbacks: {
    async signIn({ user }) {
      const email = user?.email?.toLowerCase()
      if (!email) return false
      return readAllowedEmails().has(email)
    },
    async jwt({ token, user }) {
      if (user?.email) token.guidedEmail = user.email.toLowerCase()
      return token
    },
    async session({ session, token }) {
      if (token.guidedEmail) session.guidedEmail = token.guidedEmail
      return session
    },
  },
}

export const { handlers, auth, signIn, signOut } = NextAuth(config)

export interface GuidedAuthSession {
  email: string
}

export async function getGuidedAuthSession(): Promise<GuidedAuthSession | null> {
  const session = await auth()
  const email = session?.guidedEmail ?? session?.user?.email
  if (!email) return null
  return { email: email.toLowerCase() }
}
