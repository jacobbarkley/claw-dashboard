import { expect, test } from "@playwright/test"

// Smoke for /vires/guided/preview/active. With CODEX_PROJECTION_BASE_URL
// unset on the preview deploy (current state — Supabase migration in Step 2
// replaces this path entirely), the page should render the
// GuidedSurfaceErrorState "Guided state service is not configured" via the
// projection-store-unavailable branch. No MockFallbackBadge should appear
// on this page (T1.0e cutover-prep retired the runtime mock fallback).

test("preview/active renders configured-error state, no mock fallback", async ({ page }) => {
  await page.goto("/vires/guided/preview/active")

  await expect(page.getByRole("heading", { name: "ACTIVE paper enrollment" })).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Guided state service is not configured" }),
  ).toBeVisible()
  await expect(page.getByText("Mock fallback", { exact: false })).toHaveCount(0)
})
