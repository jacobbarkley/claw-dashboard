import { expect, test } from "@playwright/test"

// VIR-16 — contract guard for /api/guided/accept-match.

const ROUTE = "/api/guided/accept-match"

test.describe("VIR-16 accept-match POST contract", () => {
  test("invalid JSON returns 400 invalid_json", async ({ request }) => {
    const res = await request.post(ROUTE, {
      headers: { "Content-Type": "application/json" },
      data: Buffer.from("not json"),
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("invalid_json")
  })

  test("missing proposal_id returns 400 invalid_payload", async ({ request }) => {
    const res = await request.post(ROUTE, {
      data: { matched_library_entry_id: "steady_tide_internal", matched_library_entry_version: 1 },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("invalid_payload")
  })

  test("missing matched_library_entry_id returns 400", async ({ request }) => {
    const res = await request.post(ROUTE, {
      data: { proposal_id: "proposal_test", matched_library_entry_version: 1 },
    })
    expect(res.status()).toBe(400)
  })

  test("negative library_entry_version returns 400", async ({ request }) => {
    const res = await request.post(ROUTE, {
      data: {
        proposal_id: "proposal_test",
        matched_library_entry_id: "steady_tide_internal",
        matched_library_entry_version: -1,
      },
    })
    expect(res.status()).toBe(400)
  })

  test("well-formed POST surfaces 503 or 403", async ({ request }) => {
    const res = await request.post(ROUTE, {
      data: {
        proposal_id: "proposal_jacob_paper_main_migration",
        matched_library_entry_id: "steady_tide_internal",
        matched_library_entry_version: 1,
      },
    })
    expect([403, 503]).toContain(res.status())
    if (res.status() === 503) {
      const body = await res.json()
      expect(body.error).toBe("command_service_unreachable")
      expect(body.next_path).toBe("/vires/guided/preview/disclosure")
    }
  })
})
