// "Check your email" landing — Auth.js redirects here after the user
// submits an email and the verification link has been dispatched.

export const dynamic = "force-dynamic"

export default function VerifyRequestPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <h1 className="font-serif text-2xl tracking-tight">Check your email</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        A sign-in link is on its way. Open it on this device to finish signing in. The link expires in 24 hours.
      </p>
      <p className="mt-4 text-xs text-muted-foreground">
        If nothing arrives, confirm the email is allowlisted on the server, then return to /signin and try again.
      </p>
    </main>
  )
}
