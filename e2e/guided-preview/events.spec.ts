import { expect, test } from "@playwright/test"

test("preview/events renders configured-error state, no mock fallback", async ({ page }) => {
  await page.goto("/vires/guided/preview/events")

  await expect(page.getByRole("heading", { name: "Unified event history" })).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Guided state service is not configured" }),
  ).toBeVisible()
  await expect(page.getByText("Mock fallback", { exact: false })).toHaveCount(0)
})
