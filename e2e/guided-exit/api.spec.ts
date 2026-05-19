import { expect, test } from "@playwright/test"

// VIR-10 — contract guards for the four exit-action POST routes.
// Same pattern as VIR-9: validation paths return 400, auth surfaces 401/403,
// and a well-formed POST in the no-backend-yet env returns 503 with
// next_path preserved.

const ROUTES = [
  "/api/guided/pause-enrollment",
  "/api/guided/resume-enrollment",
  "/api/guided/stop-hold-to-close",
  "/api/guided/stop-liquidate",
] as const

test.describe("VIR-10 exit-action POST contract", () => {
  for (const route of ROUTES) {
    test(`${route} rejects invalid JSON with 400`, async ({ request }) => {
      const res = await request.post(route, {
        headers: { "Content-Type": "application/json" },
        data: "not json",
      })
      expect(res.status()).toBe(400)
      const body = await res.json()
      expect(body.error).toBe("invalid_json")
    })

    test(`${route} rejects missing enrollment_id with 400`, async ({ request }) => {
      const res = await request.post(route, { data: {} })
      expect(res.status()).toBe(400)
      const body = await res.json()
      expect(body.error).toBe("invalid_payload")
    })

    test(`${route} rejects empty-string enrollment_id with 400`, async ({ request }) => {
      const res = await request.post(route, { data: { enrollment_id: "" } })
      expect(res.status()).toBe(400)
    })

    test(`${route} well-formed POST surfaces 503 or 403`, async ({ request }) => {
      const res = await request.post(route, {
        data: { enrollment_id: "enrollment_jacob_paper_main_active" },
      })
      expect([403, 503]).toContain(res.status())
      if (res.status() === 503) {
        const body = await res.json()
        expect(body.error).toBe("command_service_unreachable")
        expect(body.next_path).toBe("/vires/guided/preview/active")
      }
    })
  }
})
