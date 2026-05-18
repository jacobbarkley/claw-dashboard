import { expect, test } from "@playwright/test"

test("preview index describes current Guided T1 wiring honestly", async ({ page }) => {
  await page.goto("/vires/guided/preview")

  await expect(page.getByRole("heading", { name: "Guided T1 preview" })).toBeVisible()
  await expect(page.getByText("Stage 2 mocked previews", { exact: false })).toHaveCount(0)
  await expect(page.getByText("No real backend", { exact: false })).toHaveCount(0)

  await expect(page.getByRole("link", { name: /ACTIVE paper enrollment/i })).toContainText("Live readback")
  await expect(page.getByRole("link", { name: /Paper monitoring readback/i })).toContainText("Live readback")
  await expect(page.getByRole("link", { name: /Match proposal/i })).toContainText("Not wired")
  await expect(page.getByRole("link", { name: /Unified event history/i })).toContainText("Not wired")
  await expect(page.getByRole("link", { name: /Questionnaire/i })).toContainText("Static artifact")
  await expect(page.getByRole("link", { name: /Disclosure acceptance/i })).toContainText("Static artifact")
})
