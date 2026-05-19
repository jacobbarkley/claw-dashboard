import { expect, test } from "@playwright/test"

// VIR-12 — contract guard for /api/guided/accept-disclosure.

const ROUTE = "/api/guided/accept-disclosure"

test.describe("VIR-12 accept-disclosure POST contract", () => {
  test("invalid JSON returns 400", async ({ request }) => {
    const res = await request.post(ROUTE, {
      headers: { "Content-Type": "application/json" },
      // Raw bytes — Playwright's `data: <string>` JSON-encodes the value.
      data: Buffer.from("not json"),
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("invalid_json")
  })

  test("missing disclosure_version_id returns 400", async ({ request }) => {
    const res = await request.post(ROUTE, {
      data: { library_entry_id: "steady_tide_internal", library_entry_version: 1 },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("invalid_payload")
  })

  test("missing library_entry_id returns 400", async ({ request }) => {
    const res = await request.post(ROUTE, {
      data: { disclosure_version_id: "disc_steady_tide_v1", library_entry_version: 1 },
    })
    expect(res.status()).toBe(400)
  })

  test("negative library_entry_version returns 400", async ({ request }) => {
    const res = await request.post(ROUTE, {
      data: {
        disclosure_version_id: "disc_steady_tide_v1",
        library_entry_id: "steady_tide_internal",
        library_entry_version: -1,
      },
    })
    expect(res.status()).toBe(400)
  })

  test("well-formed POST surfaces 503 or 403", async ({ request }) => {
    const res = await request.post(ROUTE, {
      data: {
        disclosure_version_id: "disc_steady_tide_v1",
        library_entry_id: "steady_tide_internal",
        library_entry_version: 1,
      },
    })
    expect([403, 503]).toContain(res.status())
    if (res.status() === 503) {
      const body = await res.json()
      expect(body.error).toBe("command_service_unreachable")
      expect(body.next_path).toBe("/vires/guided/preview/broker")
    }
  })
})
