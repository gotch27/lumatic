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

test("draws, edits, restores, and exports a linear gradient mask", async ({ page }) => {
  const source = await sharp({
    create: {
      width: 1000,
      height: 1000,
      channels: 4,
      background: { r: 160, g: 160, b: 160, alpha: 1 },
    },
  }).png().toBuffer();

  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({
    name: "gradient-source.png",
    mimeType: "image/png",
    buffer: source,
  });
  await expect(page.getByTestId("photo-stage")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("tab", { name: /Masks/ }).click();
  await page.getByRole("button", { name: "Draw linear gradient" }).click();

  const stage = await page.getByTestId("photo-stage").boundingBox();
  expect(stage).not.toBeNull();
  await page.mouse.move(stage!.x + stage!.width * 0.5, stage!.y + stage!.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(stage!.x + stage!.width * 0.5, stage!.y + stage!.height * 0.52, { steps: 8 });
  await page.mouse.up();

  await expect(page.getByRole("button", { name: "Linear Gradient 1", exact: true })).toBeVisible();
  await expect(page.getByTestId("gradient-overlay")).toBeVisible();
  const endHandle = page.getByTestId("gradient-handle-end");
  const handle = await endHandle.boundingBox();
  expect(handle).not.toBeNull();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle!.x + handle!.width / 2 + 45, handle!.y + handle!.height / 2 + 15, { steps: 5 });
  await page.mouse.up();

  const localExposure = page.getByLabel("Mask Exposure value");
  await localExposure.fill("-1");
  await localExposure.press("Tab");
  await page.getByRole("tab", { name: /History/ }).click();
  await expect(page.getByTestId("history-panel")).toContainText("Created Linear Gradient 1");
  await expect(page.getByTestId("history-panel")).toContainText("Moved Linear Gradient 1");
  await expect(page.getByTestId("history-panel")).toContainText("Linear Gradient 1 · Exposure");

  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("tab", { name: /Masks/ }).click();
  await expect(page.getByLabel("Mask Exposure value")).toHaveValue("0");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.getByLabel("Mask Exposure value")).toHaveValue("-1");
  await page.getByRole("button", { name: "Before / after" }).click();
  await expect(page.getByTestId("gradient-overlay")).toBeHidden();
  await page.getByRole("button", { name: "Viewing original" }).click();
  await expect(page.getByTestId("gradient-overlay")).toBeVisible();

  await page.reload();
  await page.getByRole("tab", { name: /Masks/ }).click();
  const restoredMask = page.getByRole("button", { name: "Linear Gradient 1", exact: true });
  await expect(restoredMask).toBeVisible();
  await restoredMask.click();
  await expect(page.getByLabel("Mask Exposure value")).toHaveValue("-1");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  const topRegion = await sharp(path!).extract({ left: 0, top: 0, width: 1000, height: 150 }).png().toBuffer();
  const bottomRegion = await sharp(path!).extract({ left: 0, top: 850, width: 1000, height: 150 }).png().toBuffer();
  const top = await sharp(topRegion).stats();
  const bottom = await sharp(bottomRegion).stats();
  expect(top.channels[0].mean).toBeLessThan(bottom.channels[0].mean - 20);
});
