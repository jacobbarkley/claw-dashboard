// Mints short-TTL HS256 JWTs that Supabase RLS recognizes as authenticated
// sessions for the Step 2 spike. Signed with SUPABASE_JWT_SECRET — the same
// HMAC secret Supabase itself uses when verifying tokens issued by its own
// auth service, which is why we can hand-roll a token and have RLS accept it.
//
// Claim shape locked to Supabase conventions:
//   - sub:  the user identifier driving RLS. During Step 2 this is Jacob's
//           email (Auth.js carries email as identity). After Step 3 lands,
//           callers pass the WorkOS user ID instead — same minter, different
//           input — and the spike row's user_sub gets re-seeded to match.
//   - role: "authenticated" — Supabase RLS policies are scoped `to authenticated`
//           per the Step 2 SQL.
//   - aud:  "authenticated" — Supabase JWT audience convention.
//   - exp:  60s TTL. Re-minted per request; never persisted.
//
// The function intentionally does NOT set iss — Supabase accepts any issuer
// for HMAC-signed JWTs, and namespacing buys us nothing.
//
// See _design_handoff/INFRA_SUPABASE_RLS_SPIKE_STEP2_SPEC_2026-05-13.md.

import "server-only"

import { SignJWT } from "jose"

const SUPABASE_JWT_TTL_SECONDS = 60
const SUPABASE_JWT_SECRET_MIN_LENGTH = 32

export class SupabaseJwtMisconfiguredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SupabaseJwtMisconfiguredError"
  }
}

export async function mintSupabaseJwt(userSub: string): Promise<string> {
  if (typeof userSub !== "string" || userSub.length === 0) {
    throw new SupabaseJwtMisconfiguredError(
      "mintSupabaseJwt called with empty userSub — RLS would always deny.",
    )
  }
  const secret = process.env.SUPABASE_JWT_SECRET
  if (!secret) {
    throw new SupabaseJwtMisconfiguredError(
      "SUPABASE_JWT_SECRET is required to sign Supabase session JWTs.",
    )
  }
  if (secret.length < SUPABASE_JWT_SECRET_MIN_LENGTH) {
    throw new SupabaseJwtMisconfiguredError(
      `SUPABASE_JWT_SECRET is shorter than ${SUPABASE_JWT_SECRET_MIN_LENGTH} chars — refusing to sign.`,
    )
  }
  return await new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userSub)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime(`${SUPABASE_JWT_TTL_SECONDS}s`)
    .sign(new TextEncoder().encode(secret))
}
