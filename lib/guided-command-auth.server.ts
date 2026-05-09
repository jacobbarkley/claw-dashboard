// Server-only JWT minting for Guided command-service auth handoff.
//
// Replaces the static-bearer placeholder from T1.0c. Per the T1.0d
// architectural correction: the dashboard does not ship a permanent
// CODEX_COMMAND_BEARER_TOKEN; it mints a per-request, scoped, short-lived
// JWT and uses that as the Bearer token. Codex's command service swaps
// its T1.0b StaticBearerGuidedCommandAuthVerifier for a JWT verifier
// (per the upstream Verifier Protocol contract); the seam shape stays
// stable.
//
// JWT shape (proposed for Codex review):
//   alg: "HS256"          — HMAC-SHA256, shared secret. Asymmetric (RS256)
//                           is reasonable to swap to later if Codex
//                           prefers it; the Verifier Protocol absorbs
//                           the change without touching dashboard call sites.
//   iss: "claw-dashboard"
//   aud: "vires-numeris-guided-command-service"
//   sub: <session identity (email or gh login)>
//   exp: iat + 60 seconds
//   iat: now
//   jti: random uuid (per-request, never reused)
//   scope: { user_id, account_id, strategy_group_id }
//   actor: { type: "USER" | "OPERATOR" | "SYSTEM", id: <actor id> }
//
// Codex's verifier is expected to:
//   1. Verify signature with the shared secret.
//   2. Verify iss === "claw-dashboard" and aud === "vires-numeris-guided-command-service".
//   3. Verify exp > now and iat <= now (plus a small clock-skew tolerance).
//   4. Treat the scope claim as the AUTHENTICATED scope; reject body-scope
//      mismatch per the existing GuidedCommandGuardrailService rule.
//   5. Optionally enforce a one-time-use guarantee on jti via a short-lived
//      cache, to defend against replay within the 60s window.
//
// T1.0d does NOT actually wire CODEX_COMMAND_BASE_URL — there is no
// deployed Codex command endpoint to talk to yet. The minting code below
// runs only when both the URL AND the signing secret are configured;
// otherwise the command client throws CommandServiceUnreachableError /
// CommandServiceMisconfiguredError before reaching this module.

import "server-only"

import { randomUUID } from "node:crypto"

import { SignJWT } from "jose"

import type { GuidedScope } from "@/components/vires/guided/types"

const JWT_ISSUER = "claw-dashboard"
const JWT_AUDIENCE = "vires-numeris-guided-command-service"
const JWT_TTL_SECONDS = 60
const JWT_ALG = "HS256"

export class CommandJwtMisconfiguredError extends Error {
  constructor(reason: string) {
    super(`Guided command JWT minting misconfigured: ${reason}`)
    this.name = "CommandJwtMisconfiguredError"
  }
}

export interface MintGuidedCommandJwtArgs {
  scope: GuidedScope
  actorType: "USER" | "OPERATOR" | "SYSTEM"
  actorId: string
  subject: string
}

// Mint a per-request JWT for a Guided command POST. Throws
// CommandJwtMisconfiguredError when the signing secret env var is unset —
// the command client converts that into a CommandServiceMisconfiguredError
// upstream so callers get a single error class for the "config not ready"
// case.
export async function mintGuidedCommandJwt(args: MintGuidedCommandJwtArgs): Promise<string> {
  const secret = process.env.CODEX_COMMAND_JWT_HS256_SECRET
  if (!secret || secret.length < 32) {
    throw new CommandJwtMisconfiguredError(
      "CODEX_COMMAND_JWT_HS256_SECRET is unset or shorter than 32 chars. Generate a strong shared secret and configure server-side env (never NEXT_PUBLIC_*).",
    )
  }
  const key = new TextEncoder().encode(secret)
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({
    scope: {
      user_id: args.scope.user_id,
      account_id: args.scope.account_id,
      strategy_group_id: args.scope.strategy_group_id,
    },
    actor: { type: args.actorType, id: args.actorId },
  })
    .setProtectedHeader({ alg: JWT_ALG, typ: "JWT" })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setSubject(args.subject)
    .setIssuedAt(now)
    .setExpirationTime(now + JWT_TTL_SECONDS)
    .setJti(randomUUID())
    .sign(key)
}
