import { expect, test } from "@playwright/test";
import sharp from "sharp";

async function pngFixture(width = 1200, height = 800) {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 196, g: 116, b: 55, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

test("imports, edits, restores, exports, and clears a local library", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Shape the light. Keep every decision." })).toBeVisible();

  const valid = await pngFixture();
  await page.getByTestId("file-input").setInputFiles([
    { name: "warm-frame.png", mimeType: "image/png", buffer: valid },
    { name: "broken.png", mimeType: "image/png", buffer: Buffer.from("not-an-image") },
  ]);
  await expect(page.getByTestId("photo-stage")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("1 photo", { exact: true })).toBeVisible();
  const importError = page.getByText(/broken\.png could not be decoded/);
  await expect(importError).toBeVisible();
  await expect(importError).toBeHidden({ timeout: 10_000 });

  const exposureInput = page.getByLabel("Exposure value");
  await exposureInput.fill("1.25");
  await exposureInput.press("Tab");
  await expect(exposureInput).toHaveValue("1.25");

  await page.getByRole("tab", { name: /History/ }).click();
  await expect(page.getByTestId("history-panel")).toContainText("Exposure");
  await expect(page.getByTestId("history-panel")).toContainText("+1.25");

  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("tab", { name: /Adjust/ }).click();
  await expect(exposureInput).toHaveValue("0");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(exposureInput).toHaveValue("1.25");

  await page.reload();
  await expect(page.getByTestId("photo-stage")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel("Exposure value")).toHaveValue("1.25");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("warm-frame-edited.png");
  const path = await download.path();
  expect(path).not.toBeNull();
  const metadata = await sharp(path!).metadata();
  expect(metadata.width).toBe(1200);
  expect(metadata.height).toBe(800);
  expect(metadata.format).toBe("png");
  const editedStats = await sharp(path!).stats();
  const sourceStats = await sharp(valid).stats();
  expect(editedStats.channels[0].mean).toBeGreaterThan(sourceStats.channels[0].mean);

  await page.getByRole("button", { name: "New library" }).click();
  await expect(page.getByText("Start a new local library?")).toBeVisible();
  await page.getByRole("button", { name: "Clear and start over" }).click();
  await expect(page.getByRole("heading", { name: "Shape the light. Keep every decision." })).toBeVisible();
});

test("exports a 6000 by 4000 original through the tiled GPU path", async ({ page }) => {
  test.setTimeout(60_000);
  const largeJpeg = await sharp({
    create: {
      width: 6000,
      height: 4000,
      channels: 3,
      background: { r: 48, g: 100, b: 155 },
    },
  })
    .jpeg({ quality: 82 })
    .toBuffer();

  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({
    name: "large-original.jpg",
    mimeType: "image/jpeg",
    buffer: largeJpeg,
  });
  await expect(page.getByTestId("photo-stage")).toBeVisible({ timeout: 30_000 });

  const downloadPromise = page.waitForEvent("download", { timeout: 45_000 });
  await page.getByRole("button", { name: "Export" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  const metadata = await sharp(path!).metadata();
  expect(download.suggestedFilename()).toBe("large-original-edited.jpg");
  expect(metadata.width).toBe(6000);
  expect(metadata.height).toBe(4000);
  expect(metadata.format).toBe("jpeg");
});
