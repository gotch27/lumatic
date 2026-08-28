import { describe, expect, it } from "vitest";

import { calculateHistogram, histogramPath } from "@/editor/imaging/histogram";

describe("histogram analysis", () => {
  it("counts RGB, luminance, transparency, and clipped pixels", () => {
    const pixels = new Uint8ClampedArray([
      0, 0, 0, 255,
      255, 128, 64, 255,
      255, 255, 255, 255,
      10, 20, 30, 0,
    ]);
    const histogram = calculateHistogram(pixels);
    expect(histogram.sampleCount).toBe(3);
    expect(histogram.red[0]).toBe(1);
    expect(histogram.red[255]).toBe(2);
    expect(histogram.green[128]).toBe(1);
    expect(histogram.blue[64]).toBe(1);
    expect(histogram.luminance[150]).toBe(1);
    expect(histogram.shadowClipped).toBe(1);
    expect(histogram.highlightClipped).toBe(2);
  });

  it("builds a bounded SVG area path", () => {
    const bins = Array.from({ length: 256 }, (_, index) => index === 128 ? 16 : 0);
    const path = histogramPath(bins);
    expect(path).toMatch(/^M 0 72 L 0\.00 72\.00/);
    expect(path).toContain("128.50 0.00");
    expect(path).toMatch(/L 256 72 Z$/);
  });
});
