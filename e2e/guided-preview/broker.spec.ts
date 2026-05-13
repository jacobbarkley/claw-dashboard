import { expect, test } from "@playwright/test"

test("preview/broker renders configured-error state, no mock fallback", async ({ page }) => {
  await page.goto("/vires/guided/preview/broker")

  await expect(page.getByRole("heading", { name: "Broker connect & states" })).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Guided state service is not configured" }),
  ).toBeVisible()
  await expect(page.getByText("Mock fallback", { exact: false })).toHaveCount(0)
})
