// T1.0d sign-in surface. GitHub OAuth via Auth.js v5; the server action
// invokes signIn() which redirects to GitHub. After GitHub returns, the
// callback in lib/auth.server.ts checks the email/login allowlist before
// minting a JWT session.
//
// The kickoff plan §2.3 default is email magic link with Jacob allowlisted.
// T1.0d uses GitHub OAuth instead because Auth.js's email provider requires
// a session/token store (DB) to persist verification tokens; claw-dashboard
// has no DB until T1.0e. When Postgres lands, this page can swap to email
// magic link without touching any other dashboard code.

import { signIn, auth } from "@/lib/auth.server"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

interface SignInPageProps {
  searchParams: Promise<{ from?: string; error?: string }>
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const session = await auth()
  const params = await searchParams
  const from = typeof params.from === "string" && params.from.startsWith("/") ? params.from : "/vires"

  if (session) {
    redirect(from)
  }

  async function handleSignIn() {
    "use server"
    await signIn("github", { redirectTo: from })
  }

  const errorCopy = decodeAuthError(params.error)

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 16px",
        background: "var(--vr-bg, #0c0a17)",
        color: "var(--vr-cream, #f1ece0)",
      }}
    >
      <div style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
        <h1
          style={{
            fontFamily: "var(--ff-serif, serif)",
            fontWeight: 400,
            fontSize: 28,
            marginBottom: 12,
          }}
        >
          Sign in to Vires
        </h1>
        <p
          style={{
            opacity: 0.7,
            fontSize: 13,
            lineHeight: 1.5,
            marginBottom: 28,
          }}
        >
          Internal preview — access is limited to allowlisted accounts. T1
          internal-provider choice: GitHub OAuth (the kickoff plan&apos;s default
          email magic link is deferred to T1.0e when the private store lands).
        </p>
        {errorCopy ? (
          <p
            role="alert"
            style={{
              fontSize: 12,
              padding: "10px 14px",
              border: "1px solid rgba(217, 99, 99, 0.35)",
              background: "rgba(217, 99, 99, 0.08)",
              color: "var(--vr-down, #d96363)",
              borderRadius: 3,
              marginBottom: 20,
            }}
          >
            {errorCopy}
          </p>
        ) : null}
        <form action={handleSignIn}>
          <button
            type="submit"
            style={{
              padding: "12px 20px",
              background: "var(--vr-gold, #c9a96a)",
              color: "var(--vr-ink, #0c0a17)",
              border: "1px solid var(--vr-gold, #c9a96a)",
              borderRadius: 3,
              fontWeight: 600,
              fontSize: 13,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Continue with GitHub
          </button>
        </form>
        <p style={{ fontSize: 11, opacity: 0.5, marginTop: 32 }}>
          Not the right place?{" "}
          <a href="/vires" style={{ color: "var(--vr-cream-mute, #b8b1a0)" }}>
            Back to Vires
          </a>
        </p>
      </div>
    </main>
  )
}

function decodeAuthError(error: string | undefined): string | null {
  if (!error) return null
  // Auth.js v5 error codes returned via /signin?error=... — keep the
  // mapping narrow; unknown codes fall through to a generic message.
  switch (error) {
    case "AccessDenied":
      return "This GitHub account is not on the internal allowlist."
    case "Configuration":
      return "Auth provider is not configured. Set AUTH_GITHUB_ID, AUTH_GITHUB_SECRET, and AUTH_SECRET."
    case "Verification":
      return "The sign-in link expired or was already used."
    default:
      return "Sign-in failed. Try again or check the server logs for details."
  }
}
