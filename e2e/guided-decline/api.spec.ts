import { expect, test } from "@playwright/test"

// VIR-9 — guard the contract surface of /api/guided/decline-match and
// /api/guided/save-questionnaire-progress.
//
// These specs target the API contract only (validation, error mapping,
// command-service-unreachable behavior). The decline UI surface itself is
// covered when the match preview route renders real proposal data; today
// that surface still shows the configured-not-ready empty state on the
// Supabase spike, so visual e2e for the form lives downstream.
//
// In the current preview env, CODEX_COMMAND_BASE_URL is intentionally
// unset, so any well-formed authenticated POST should surface
// CommandServiceUnreachableError → 503 with the forward_path next_path
// intact. If the seeded e2e identity has no scope mapping, the handler
// returns 403 before reaching the command client; either is acceptable
// as the "not blocked on contract drift" signal.

const DECLINE_PATH = "/api/guided/decline-match"
const MAYBE_LATER_PATH = "/api/guided/save-questionnaire-progress"

test.describe("VIR-9 decline-match POST contract", () => {
  test("invalid JSON body returns 400", async ({ request }) => {
    const res = await request.post(DECLINE_PATH, {
      headers: { "Content-Type": "application/json" },
      data: "not json at all",
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("invalid_json")
  })

  test("missing forward_path returns 400 invalid_payload", async ({ request }) => {
    const res = await request.post(DECLINE_PATH, {
      data: {
        proposal_id: "proposal_test",
        responses: [],
        opt_in_notify_when_library_grows: false,
      },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("invalid_payload")
  })

  test("over-length open_ended_note returns 400 invalid_payload", async ({ request }) => {
    const res = await request.post(DECLINE_PATH, {
      data: {
        proposal_id: "proposal_test",
        responses: [],
        open_ended_note: "x".repeat(501),
        forward_path: "maybe_later",
        opt_in_notify_when_library_grows: false,
      },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("invalid_payload")
  })

  test("well-formed POST surfaces 503 unreachable or 403 unknown scope", async ({ request }) => {
    const res = await request.post(DECLINE_PATH, {
      data: {
        proposal_id: "proposal_test",
        responses: [{ question_key: "risk_profile_fit", answer_option_id: "risk_too_high" }],
        open_ended_note: null,
        forward_path: "maybe_later",
        opt_in_notify_when_library_grows: false,
      },
    })
    expect([403, 503]).toContain(res.status())
    if (res.status() === 503) {
      const body = await res.json()
      expect(body.error).toBe("command_service_unreachable")
      expect(body.next_path).toBe("/vires/guided/preview")
      expect(body.forward_path).toBe("maybe_later")
    }
  })

  test("forward_path=request_re_questionnaire returns its next_path on 503", async ({
    request,
  }) => {
    const res = await request.post(DECLINE_PATH, {
      data: {
        proposal_id: "proposal_test",
        responses: [],
        open_ended_note: null,
        forward_path: "request_re_questionnaire",
        opt_in_notify_when_library_grows: false,
      },
    })
    expect([403, 503]).toContain(res.status())
    if (res.status() === 503) {
      const body = await res.json()
      expect(body.next_path).toBe("/vires/guided/preview/questionnaire")
    }
  })
})

test.describe("save-questionnaire-progress POST contract", () => {
  test("empty body is accepted (defaults applied)", async ({ request }) => {
    const res = await request.post(MAYBE_LATER_PATH, { data: {} })
    expect([403, 503]).toContain(res.status())
    if (res.status() === 503) {
      const body = await res.json()
      expect(body.next_path).toBe("/vires/guided/preview")
    }
  })

  test("unknown reason value returns 400", async ({ request }) => {
    const res = await request.post(MAYBE_LATER_PATH, {
      data: { reason: "not_a_valid_reason" },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("invalid_payload")
  })
})
