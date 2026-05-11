// Server-only JWT minter for the dashboard → vires-numeris command service
// handoff (T1.0d).
//
// The command service (T1.0b) accepts a Bearer token. T1.0b shipped with a
// StaticBearerGuidedCommandAuthVerifier — a stand-in that the production
// path swaps out for a JWT verifier. This module produces those JWTs.
//
// Contract (matches the JWT verifier Codex will land at runtime cutover):
//   Algorithm: HS256
//   Issuer:    "claw-dashboard"
//   Audience:  "vires-numeris-guided-command-service"
//   Subject:   the authenticated email (also surfaced as actor.id)
//   TTL:       60 seconds (short-lived; minted per-request)
//   Claims:
//     scope:  GuidedScope from the auth context (authoritative)
//     actor:  { type, id }
//     jti:    random UUID for replay protection
//
// The HS256 secret is configured via CODEX_COMMAND_JWT_HS256_SECRET. We
// require >= 32 chars so a fat-fingered short secret cannot accidentally
// pass through. The runtime endpoint is *not* called from this PR — the
// command client wires the token onto outgoing requests, but no production
// command-service base URL exists until T1.0e.

import "server-only"

import { randomUUID } from "node:crypto"
import { SignJWT } from "jose"

import type { GuidedScope } from "@/components/vires/guided/types"

const JWT_ISSUER = "claw-dashboard"
const JWT_AUDIENCE = "vires-numeris-guided-command-service"
const JWT_TTL_SECONDS = 60
const JWT_ALG = "HS256"
const MIN_SECRET_LENGTH = 32

export class CommandJwtMisconfiguredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CommandJwtMisconfiguredError"
  }
}

export interface MintGuidedCommandJwtArgs {
  scope: GuidedScope
  actorType: string
  actorId: string
  subject: string
}

export async function mintGuidedCommandJwt(args: MintGuidedCommandJwtArgs): Promise<string> {
  const secret = process.env.CODEX_COMMAND_JWT_HS256_SECRET
  if (!secret) {
    throw new CommandJwtMisconfiguredError(
      "CODEX_COMMAND_JWT_HS256_SECRET is required to mint command-service JWTs.",
    )
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new CommandJwtMisconfiguredError(
      `CODEX_COMMAND_JWT_HS256_SECRET must be at least ${MIN_SECRET_LENGTH} characters.`,
    )
  }

  const now = Math.floor(Date.now() / 1000)
  return await new SignJWT({
    scope: args.scope,
    actor: { type: args.actorType, id: args.actorId },
  })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setSubject(args.subject)
    .setIssuedAt(now)
    .setExpirationTime(now + JWT_TTL_SECONDS)
    .setJti(randomUUID())
    .sign(new TextEncoder().encode(secret))
}
