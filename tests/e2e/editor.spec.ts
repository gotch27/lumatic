import { expect, test } from "@playwright/test";
import sharp from "sharp";

// GitHub's headless Chromium uses a software WebGL renderer; full image effects and
// export assertions need more wall time there than they do on a desktop GPU.
const EDITOR_TEST_TIMEOUT = process.env.CI ? 120_000 : 60_000;

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

async function sampledRedMean(image: Buffer, x: number, y: number, size = 11) {
  const half = Math.floor(size / 2);
  const sample = await sharp(image)
    .extract({ left: Math.round(x) - half, top: Math.round(y) - half, width: size, height: size })
    .png()
    .toBuffer();
  const stats = await sharp(sample).stats();
  return stats.channels[0].mean;
}

test("imports, edits, restores, exports, and clears a local library", async ({ page }) => {
  test.setTimeout(EDITOR_TEST_TIMEOUT);
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
  test.setTimeout(EDITOR_TEST_TIMEOUT);
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
  test.setTimeout(EDITOR_TEST_TIMEOUT);
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

  const boundaries = page.locator(".gradient-boundary");
  await expect(boundaries).toHaveCount(2);
  await page.mouse.click(stage!.x + 12, stage!.y + stage!.height / 2);
  await expect(boundaries).toHaveCount(0);
  await expect(page.getByTestId("gradient-handle-start")).toHaveCount(0);
  const axis = page.locator('[data-testid^="gradient-line-"]').first();
  await expect(axis).toBeVisible();
  const axisBox = await axis.boundingBox();
  expect(axisBox).not.toBeNull();
  await page.mouse.click(axisBox!.x + axisBox!.width / 2, axisBox!.y + axisBox!.height / 2);
  await expect(boundaries).toHaveCount(2);

  const imageSize = Math.min(stage!.width - 56, stage!.height - 56, 1000);
  const imageTop = stage!.y + (stage!.height - imageSize) / 2;
  const imageBottom = imageTop + imageSize;
  const startHandle = page.getByTestId("gradient-handle-start");
  let startBox = await startHandle.boundingBox();
  expect(startBox).not.toBeNull();
  await page.mouse.move(startBox!.x + startBox!.width / 2, startBox!.y + startBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(startBox!.x + startBox!.width / 2, stage!.y + 8, { steps: 6 });
  await page.mouse.up();
  startBox = await startHandle.boundingBox();
  expect(startBox).not.toBeNull();
  expect(startBox!.y + startBox!.height / 2).toBeLessThan(imageTop);

  let endBox = await endHandle.boundingBox();
  expect(endBox).not.toBeNull();
  await page.mouse.move(endBox!.x + endBox!.width / 2, endBox!.y + endBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(endBox!.x + endBox!.width / 2, stage!.y + stage!.height - 8, { steps: 6 });
  await page.mouse.up();
  endBox = await endHandle.boundingBox();
  expect(endBox).not.toBeNull();
  expect(endBox!.y + endBox!.height / 2).toBeGreaterThan(imageBottom);

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

test("edits curves, color, effects, and detail through the shared develop workflow", async ({ page }) => {
  test.setTimeout(EDITOR_TEST_TIMEOUT);
  const source = await sharp({
    create: { width: 800, height: 600, channels: 4, background: { r: 118, g: 132, b: 160, alpha: 1 } },
  }).png().toBuffer();

  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({ name: "develop-suite.png", mimeType: "image/png", buffer: source });
  const photoStage = page.getByTestId("photo-stage");
  await expect(photoStage).toBeVisible({ timeout: 20_000 });
  const photoStageBox = await photoStage.boundingBox();
  expect(photoStageBox).not.toBeNull();
  const neutralPreview = await photoStage.screenshot();
  const neutralRed = await sampledRedMean(neutralPreview, photoStageBox!.width / 2, photoStageBox!.height / 2);

  const curveGraph = page.getByLabel("rgb tone curve");
  await curveGraph.scrollIntoViewIfNeeded();
  const graph = await curveGraph.boundingBox();
  expect(graph).not.toBeNull();
  await expect(page.locator(".curve-point")).toHaveCount(2);
  const blackPoint = page.getByTestId("curve-point-0");
  const blackPointBox = await blackPoint.boundingBox();
  expect(blackPointBox).not.toBeNull();
  const initialBlackCx = await blackPoint.getAttribute("cx");
  const initialBlackCy = await blackPoint.getAttribute("cy");
  await page.mouse.move(blackPointBox!.x + blackPointBox!.width / 2, blackPointBox!.y + blackPointBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(blackPointBox!.x + blackPointBox!.width / 2 + 20, blackPointBox!.y - 20, { steps: 5 });
  await page.mouse.up();
  await expect(blackPoint).not.toHaveAttribute("cx", initialBlackCx!);
  await expect(blackPoint).not.toHaveAttribute("cy", initialBlackCy!);
  await page.mouse.click(graph!.x + graph!.width / 2, graph!.y + graph!.height / 2);
  await expect(page.locator(".curve-point")).toHaveCount(3);
  await page.getByRole("button", { name: "Delete selected curve point" }).click();
  await expect(page.locator(".curve-point")).toHaveCount(2);
  await page.mouse.click(graph!.x + graph!.width / 2, graph!.y + graph!.height / 2);
  const curveMidpoint = page.getByTestId("curve-point-1");
  const midpoint = await curveMidpoint.boundingBox();
  expect(midpoint).not.toBeNull();
  const initialCx = await curveMidpoint.getAttribute("cx");
  const initialCy = await curveMidpoint.getAttribute("cy");
  await page.mouse.move(midpoint!.x + midpoint!.width / 2, midpoint!.y + midpoint!.height / 2);
  await page.mouse.down();
  await page.mouse.move(midpoint!.x + midpoint!.width / 2 + 35, midpoint!.y - 75, { steps: 6 });
  await page.mouse.up();
  await expect(curveMidpoint).not.toHaveAttribute("cx", initialCx!);
  await expect(curveMidpoint).not.toHaveAttribute("cy", initialCy!);
  const movedCx = await curveMidpoint.getAttribute("cx");
  const movedCy = await curveMidpoint.getAttribute("cy");
  const curvedPreview = await photoStage.screenshot();
  const curvedRed = await sampledRedMean(curvedPreview, photoStageBox!.width / 2, photoStageBox!.height / 2);
  expect(curvedRed).toBeGreaterThan(neutralRed + 5);

  await page.getByRole("tab", { name: "Color", exact: true }).click();
  await page.getByRole("tab", { name: "Blue", exact: true }).click();
  await page.getByLabel("Blue Saturation value").fill("-30");
  await page.getByLabel("Blue Saturation value").press("Tab");
  await page.getByRole("tab", { name: "Highlights", exact: true }).click();
  await page.getByLabel("highlights Hue value").fill("42");
  await page.getByLabel("highlights Hue value").press("Tab");
  await page.getByLabel("highlights Saturation value").fill("25");
  await page.getByLabel("highlights Saturation value").press("Tab");

  await page.getByRole("tab", { name: "Effects", exact: true }).click();
  await page.getByLabel("Texture value").fill("35");
  await page.getByLabel("Texture value").press("Escape");
  await expect(page.getByLabel("Texture value")).toHaveValue("0");
  for (const [label, value] of [["Clarity", "25"], ["Dehaze", "20"], ["Vignette", "-55"], ["Grain", "24"]] as const) {
    await page.getByLabel(`${label} value`).fill(value);
    await page.getByLabel(`${label} value`).press("Tab");
  }
  await page.getByRole("tab", { name: "Detail", exact: true }).click();
  for (const [label, value] of [["Sharpening", "40"], ["Noise Reduction", "15"], ["Color Noise Reduction", "25"]] as const) {
    await page.getByLabel(`${label} value`, { exact: true }).fill(value);
    await page.getByLabel(`${label} value`, { exact: true }).press("Tab");
  }

  await page.getByRole("tab", { name: /History/ }).click();
  const history = page.getByTestId("history-panel");
  await expect(history).toContainText("RGB curve");
  await expect(history).toContainText("Blue saturation");
  await expect(history).toContainText("Highlights hue");
  await expect(history).toContainText("Vignette");
  await expect(history).toContainText("Sharpening");

  await page.reload();
  await page.getByRole("tab", { name: /Adjust/ }).click();
  await expect(page.locator(".curve-point")).toHaveCount(3);
  await expect(page.getByTestId("curve-point-1")).toHaveAttribute("cx", movedCx!);
  await expect(page.getByTestId("curve-point-1")).toHaveAttribute("cy", movedCy!);
  await page.getByRole("tab", { name: "Effects", exact: true }).click();
  await expect(page.getByLabel("Vignette value")).toHaveValue("-55");
  await expect(page.getByLabel("Grain value")).toHaveValue("24");
  await page.getByRole("tab", { name: "Detail", exact: true }).click();
  await expect(page.getByLabel("Sharpening value")).toHaveValue("40");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  const cornerBuffer = await sharp(path!).extract({ left: 0, top: 0, width: 100, height: 100 }).png().toBuffer();
  const centerBuffer = await sharp(path!).extract({ left: 350, top: 250, width: 100, height: 100 }).png().toBuffer();
  const corner = await sharp(cornerBuffer).stats();
  const center = await sharp(centerBuffer).stats();
  expect(corner.channels[0].mean).toBeLessThan(center.channels[0].mean - 10);
  expect(center.channels[0].stdev).toBeGreaterThan(1);
});

test("keeps vignette and linear gradients locked to image space while panning", async ({ page }) => {
  test.setTimeout(EDITOR_TEST_TIMEOUT);
  const width = 1200;
  const height = 600;
  const source = await sharp({
    create: { width, height, channels: 4, background: { r: 170, g: 170, b: 170, alpha: 1 } },
  }).png().toBuffer();

  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({ name: "spatial-source.png", mimeType: "image/png", buffer: source });
  const stage = page.getByTestId("photo-stage");
  await expect(stage).toBeVisible({ timeout: 20_000 });
  const stageBox = await stage.boundingBox();
  expect(stageBox).not.toBeNull();

  const scale = Math.min((stageBox!.width - 56) / width, (stageBox!.height - 56) / height, 1);
  const imageWidth = width * scale;
  const imageHeight = height * scale;
  const imageLeft = (stageBox!.width - imageWidth) / 2;
  const imageTop = (stageBox!.height - imageHeight) / 2;
  const center = { x: imageLeft + imageWidth / 2, y: imageTop + imageHeight / 2 };
  const corner = { x: imageLeft + 35, y: imageTop + 35 };

  await page.getByRole("tab", { name: "Effects", exact: true }).click();
  await page.getByLabel("Vignette value").fill("-80");
  await page.getByLabel("Vignette value").press("Tab");
  const vignetteBefore = await stage.screenshot();
  const centerBefore = await sampledRedMean(vignetteBefore, center.x, center.y);
  const cornerBefore = await sampledRedMean(vignetteBefore, corner.x, corner.y);
  expect(centerBefore).toBeGreaterThan(cornerBefore + 25);

  const pan = { x: 150, y: 55 };
  await page.mouse.move(stageBox!.x + center.x, stageBox!.y + center.y);
  await page.mouse.down();
  await page.mouse.move(stageBox!.x + center.x + pan.x, stageBox!.y + center.y + pan.y, { steps: 8 });
  await page.mouse.up();
  const vignetteAfter = await stage.screenshot();
  const centerAfter = await sampledRedMean(vignetteAfter, center.x + pan.x, center.y + pan.y);
  const cornerAfter = await sampledRedMean(vignetteAfter, corner.x + pan.x, corner.y + pan.y);
  expect(Math.abs(centerAfter - centerBefore)).toBeLessThan(3);
  expect(Math.abs(cornerAfter - cornerBefore)).toBeLessThan(3);

  await page.getByRole("button", { name: "Fit photo" }).click();
  await page.getByLabel("Vignette value").fill("0");
  await page.getByLabel("Vignette value").press("Tab");
  await page.getByRole("tab", { name: /Masks/ }).click();
  await page.getByRole("button", { name: "Draw linear gradient" }).click();
  const start = { x: imageLeft + imageWidth * 0.25, y: imageTop + imageHeight * 0.25 };
  const end = { x: imageLeft + imageWidth * 0.75, y: imageTop + imageHeight * 0.75 };
  await page.mouse.move(stageBox!.x + start.x, stageBox!.y + start.y);
  await page.mouse.down();
  await page.mouse.move(stageBox!.x + end.x, stageBox!.y + end.y, { steps: 8 });
  await page.mouse.up();
  await page.getByLabel("Mask Exposure value").fill("-2");
  await page.getByLabel("Mask Exposure value").press("Tab");

  await page.addStyleTag({ content: ".gradient-overlay { visibility: hidden !important; }" });
  const gradient = await stage.screenshot();
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const direction = { x: dx / length, y: dy / length };
  const normal = { x: -direction.y, y: direction.x };
  const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const darkPoint = { x: start.x - direction.x * 45, y: start.y - direction.y * 45 };
  const lightPoint = { x: end.x + direction.x * 45, y: end.y + direction.y * 45 };
  const parallelA = { x: midpoint.x + normal.x * 85, y: midpoint.y + normal.y * 85 };
  const parallelB = { x: midpoint.x - normal.x * 85, y: midpoint.y - normal.y * 85 };
  const dark = await sampledRedMean(gradient, darkPoint.x, darkPoint.y);
  const light = await sampledRedMean(gradient, lightPoint.x, lightPoint.y);
  const sameProjectionA = await sampledRedMean(gradient, parallelA.x, parallelA.y);
  const sameProjectionB = await sampledRedMean(gradient, parallelB.x, parallelB.y);
  expect(dark).toBeLessThan(light - 45);
  expect(Math.abs(sameProjectionA - sameProjectionB)).toBeLessThan(3);

  const gradientPan = { x: 105, y: -35 };
  await page.mouse.move(stageBox!.x + midpoint.x, stageBox!.y + midpoint.y);
  await page.mouse.down();
  await page.mouse.move(
    stageBox!.x + midpoint.x + gradientPan.x,
    stageBox!.y + midpoint.y + gradientPan.y,
    { steps: 8 },
  );
  await page.mouse.up();
  const gradientAfterPan = await stage.screenshot();
  const darkAfterPan = await sampledRedMean(
    gradientAfterPan,
    darkPoint.x + gradientPan.x,
    darkPoint.y + gradientPan.y,
  );
  const lightAfterPan = await sampledRedMean(
    gradientAfterPan,
    lightPoint.x + gradientPan.x,
    lightPoint.y + gradientPan.y,
  );
  expect(Math.abs(darkAfterPan - dark)).toBeLessThan(3);
  expect(Math.abs(lightAfterPan - light)).toBeLessThan(3);
});
