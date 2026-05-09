// Email magic-link sign-in page. The form posts to a server action that
// invokes Auth.js's signIn("resend", ...) with the typed email. Auth.js
// validates against the allowlist (signIn callback in lib/auth.server.ts)
// and dispatches the magic link via the Resend HTTP API.

import { signIn } from "@/lib/auth.server"

export const dynamic = "force-dynamic"

interface SearchParams {
  from?: string
  error?: string
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const { from, error } = await searchParams
  const callbackUrl = from && from.startsWith("/") ? from : "/"

  async function submit(formData: FormData) {
    "use server"
    const email = String(formData.get("email") ?? "").trim().toLowerCase()
    if (!email) return
    await signIn("resend", { email, redirectTo: callbackUrl })
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <h1 className="font-serif text-2xl tracking-tight">Sign in to Vires</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Enter your email to receive a magic link. Allowlisted addresses only.
      </p>
      {error ? (
        <p className="mt-4 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          Sign-in failed: {error}. Check the email is allowlisted, then try again.
        </p>
      ) : null}
      <form action={submit} className="mt-6 space-y-3">
        <label className="block text-xs uppercase tracking-wide text-muted-foreground" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full rounded border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/30"
        />
        <button
          type="submit"
          className="w-full rounded bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
        >
          Send magic link
        </button>
      </form>
    </main>
  )
}
