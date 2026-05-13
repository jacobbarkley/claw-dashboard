// Server-only E2E auth bypass route. Playwright's globalSetup POSTs a
// signed bypass token here; this route delegates to Auth.js's signIn()
// against the "e2e-bypass" Credentials provider that lib/auth.server.ts
// adds conditionally when E2E_AUTH_BYPASS=1.
//
// The route refuses to mount unless E2E_AUTH_BYPASS === "1". E2E_AUTH_BYPASS
// is set only on Vercel Preview scope — never Production, never Development.
// In production-built runtimes without that env var, this route returns 404
// and the Credentials provider isn't in the provider list either.
//
// Authentication shape:
//   1. Playwright mints an HS256 JWT signed with E2E_AUTH_BYPASS_SECRET,
//      payload includes { email, iss, aud, exp (~60s) }.
//   2. POSTs { token } to /api/e2e/auth on the preview deploy.
//   3. This route hands the token to signIn("e2e-bypass", ...). The
//      Credentials provider's authorize() verifies the JWT and returns
//      the user; Auth.js writes the session cookie.
//   4. Playwright saves the cookie via request.storageState() and reuses
//      it across all specs.

import "server-only"

import { NextResponse } from "next/server"

import { signIn } from "@/lib/auth.server"

export async function POST(req: Request): Promise<NextResponse> {
  if (process.env.E2E_AUTH_BYPASS !== "1") {
    return NextResponse.json({ error: "E2E bypass not enabled" }, { status: 404 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 })
  }

  const token = (body as { token?: unknown } | null)?.token
  if (typeof token !== "string" || token.length === 0) {
    return NextResponse.json({ error: "missing token" }, { status: 400 })
  }

  // With redirect: false, Auth.js v5 sets the session cookie on success and
  // throws AuthError on failure (invalid credentials, allowlist rejection,
  // adapter failure). It does not throw NEXT_REDIRECT in this mode.
  try {
    await signIn("e2e-bypass", { token, redirect: false })
  } catch (err) {
    return NextResponse.json(
      { error: "bypass sign-in failed", reason: (err as Error).message },
      { status: 401 },
    )
  }

  return NextResponse.json({ ok: true })
}
