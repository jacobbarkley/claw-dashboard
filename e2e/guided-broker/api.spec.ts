import { expect, test } from "@playwright/test"

// VIR-13 — contract guard for /api/guided/retry-broker-setup.

const ROUTE = "/api/guided/retry-broker-setup"

test.describe("VIR-13 retry-broker-setup POST contract", () => {
  test("invalid JSON returns 400", async ({ request }) => {
    const res = await request.post(ROUTE, {
      headers: { "Content-Type": "application/json" },
      data: Buffer.from("not json"),
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("invalid_json")
  })

  test("missing enrollment_id returns 400", async ({ request }) => {
    const res = await request.post(ROUTE, { data: {} })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("invalid_payload")
  })

  test("empty enrollment_id returns 400", async ({ request }) => {
    const res = await request.post(ROUTE, { data: { enrollment_id: "" } })
    expect(res.status()).toBe(400)
  })

  test("well-formed POST surfaces 503 or 403", async ({ request }) => {
    const res = await request.post(ROUTE, {
      data: { enrollment_id: "enrollment_jacob_paper_main_active" },
    })
    expect([403, 503]).toContain(res.status())
    if (res.status() === 503) {
      const body = await res.json()
      expect(body.error).toBe("command_service_unreachable")
      expect(body.next_path).toBe("/vires/guided/preview/broker")
    }
  })
})
