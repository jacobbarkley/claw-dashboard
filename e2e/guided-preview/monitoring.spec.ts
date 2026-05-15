import { expect, test } from "@playwright/test"

// Smoke for /vires/guided/preview/monitoring.
//
// Branches on the same GUIDED_READ_STORE flag as active.spec.ts because
// monitoring uses the same readGuidedEnrollmentView call site. The Step 2
// Supabase store implements that read, so under the flag the monitoring
// page renders real seeded data (library_entry.friendly_name = "Steady
// Tide"). Under any other value, the store throws
// GuidedUserStateUnavailableError and the page renders the configured-
// error state.
//
// The other three sibling specs (broker / events / match) stay on the
// configured-error assertion regardless of mode — their read methods are
// not implemented by the Step 2 Supabase store and still reject with
// GuidedUserStateUnavailableError.

const STORE = process.env.GUIDED_READ_STORE ?? ""

test("preview/monitoring renders shell title", async ({ page }) => {
  await page.goto("/vires/guided/preview/monitoring")
  await expect(page.getByRole("heading", { name: "Paper monitoring readback" })).toBeVisible()
  await expect(page.getByText("Mock fallback", { exact: false })).toHaveCount(0)
})

test("preview/monitoring renders backend-dependent body", async ({ page }) => {
  await page.goto("/vires/guided/preview/monitoring")

  if (STORE === "supabase") {
    await expect(page.getByText("Steady Tide", { exact: false }).first()).toBeVisible()
    await expect(
      page.getByRole("heading", { name: "Guided state service is not configured" }),
    ).toHaveCount(0)
  } else {
    await expect(
      page.getByRole("heading", { name: "Guided state service is not configured" }),
    ).toBeVisible()
  }
})
