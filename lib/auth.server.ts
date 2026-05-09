// Auth.js v5 (next-auth@beta) configuration. Server-only.
//
// T1.0d uses GitHub OAuth + JWT-only sessions as the T1 internal-provider
// choice. The kickoff plan §2.3 default is email magic link, but Auth.js's
// email provider requires a session/token store (DB) to persist verification
// tokens between request and click. claw-dashboard has no DB until T1.0e
// (when DATA-T1-PRIVATE-STORE-DECISION closes); using email magic link now
// would require setting up Postgres just for auth, which is out of scope.
//
// GitHub OAuth + JWT sessions:
//   - No DB required (Auth.js handles JWT sessions in-memory per request)
//   - Real auth provider (not a credentials/passphrase shortcut)
//   - Scales cleanly to T2: when Postgres lands, switch to email magic link
//     by adding the EmailProvider + adapter without changing any call site
//   - Single dev/prod env config: AUTH_GITHUB_ID, AUTH_GITHUB_SECRET, AUTH_SECRET
//
// Allowlist enforced server-side in the signIn callback. Either the user's
// GitHub email OR their GitHub login must match an allowlisted entry —
// belt-and-suspenders since GitHub may not always return a verified email.

import "server-only"

import NextAuth, { type NextAuthConfig } from "next-auth"
import GitHub from "next-auth/providers/github"

// Module augmentation: Auth.js's default Session and JWT shapes don't carry
// the GitHub login claim we use as an alternate identity key. Augment both
// so the callbacks and getGuidedAuthSession() can read the field without
// `as` casts.
declare module "next-auth" {
  interface Session {
    guidedGhLogin?: string
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    guidedGhLogin?: string
  }
}

const allowedEmails = (process.env.AUTH_ALLOWED_EMAILS ?? "")
  .split(",")
  .map(s => s.trim().toLowerCase())
  .filter(Boolean)

const allowedGitHubLogins = (process.env.AUTH_ALLOWED_GITHUB_LOGINS ?? "")
  .split(",")
  .map(s => s.trim().toLowerCase())
  .filter(Boolean)

export const authConfig: NextAuthConfig = {
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user, profile }) {
      const email = (user.email ?? "").toLowerCase()
      const ghLogin = String(
        (profile as { login?: string } | null | undefined)?.login ?? "",
      ).toLowerCase()
      const emailMatch = email.length > 0 && allowedEmails.includes(email)
      const loginMatch = ghLogin.length > 0 && allowedGitHubLogins.includes(ghLogin)
      return emailMatch || loginMatch
    },
    async jwt({ token, profile }) {
      // Persist GitHub login on the JWT so resolveCurrentScope() can use
      // either email or login as the identity key. profile is only present
      // on the initial sign-in callback.
      if (profile && typeof (profile as { login?: string }).login === "string") {
        token.guidedGhLogin = (profile as { login: string }).login.toLowerCase()
      }
      return token
    },
    async session({ session, token }) {
      // Surface the GitHub login on the session for server-only consumers
      // (lib/guided-scope.server.ts).
      if (typeof token.guidedGhLogin === "string") {
        session.guidedGhLogin = token.guidedGhLogin
      }
      return session
    },
  },
  pages: {
    signIn: "/signin",
  },
}

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig)

export interface GuidedAuthSession {
  email: string | null
  guidedGhLogin: string | null
}

// Read the active session and return the narrow Guided-relevant shape, or
// null when no session is active. Wrapper around Auth.js's auth() so the
// scope resolver doesn't depend on Auth.js types directly — keeps the
// migration-optionality posture if we swap providers later.
export async function getGuidedAuthSession(): Promise<GuidedAuthSession | null> {
  const session = await auth()
  if (!session) return null
  const email = session.user?.email ?? null
  const guidedGhLogin = typeof session.guidedGhLogin === "string" ? session.guidedGhLogin : null
  if (!email && !guidedGhLogin) return null
  return { email, guidedGhLogin }
}
