import { expect, test } from "@playwright/test"

// Smoke for /vires/guided/preview/active.
//
// Two assertion modes, branched on the same env var that selects the read
// store on the dashboard server (GUIDED_READ_STORE):
//
//   - supabase: Step 2 RLS spike is wired. The page resolves Jacob's scope,
//     mints a session JWT, reads the seeded guided_enrollment_spike row, and
//     renders the ActiveEnrollmentSurface with the seeded library_entry
//     friendly_name "Steady Tide". This is the proof-of-life that the
//     dashboard-side store talks to PostgREST under RLS.
//
//   - anything else (current Preview default before the cutover): the
//     factory throws GuidedUserStateUnavailableError and the page renders
//     "Guided state service is not configured". The other four preview
//     specs (broker / events / match / monitoring) stay in this branch
//     under both modes because the spike's SupabaseGuidedReadStore only
//     implements readGuidedEnrollmentView.

const STORE = process.env.GUIDED_READ_STORE ?? ""

test("preview/active renders shell title", async ({ page }) => {
  await page.goto("/vires/guided/preview/active")
  await expect(page.getByRole("heading", { name: "ACTIVE paper enrollment" })).toBeVisible()
  await expect(page.getByText("Mock fallback", { exact: false })).toHaveCount(0)
})

test("preview/active renders backend-dependent body", async ({ page }) => {
  await page.goto("/vires/guided/preview/active")

  if (STORE === "supabase") {
    // Seeded payload — friendly_name on the library_entry the spike row
    // points at. Verified against the production guided_enrollment_view.v1
    // artifact at the time of the Step 2 seed.
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
