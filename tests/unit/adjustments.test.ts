import { describe, expect, it } from "vitest";

import {
  ADJUSTMENT_DEFINITIONS,
  clampAdjustment,
  clampGradientGeometry,
  createDefaultAdjustments,
  createDefaultEditState,
  isEdited,
  normalizeEditState,
} from "@/editor/domain/adjustments";
import {
  DETAIL_DEFINITIONS,
  EFFECT_DEFINITIONS,
  createDefaultColorMix,
  createDefaultToneCurve,
  evaluateToneCurve,
  normalizeCurvePoints,
} from "@/editor/domain/developSettings";

describe("adjustment domain", () => {
  it("defines the ten human editing controls", () => {
    expect(ADJUSTMENT_DEFINITIONS).toHaveLength(10);
    expect(ADJUSTMENT_DEFINITIONS.map((item) => item.key)).toEqual([
      "exposure",
      "contrast",
      "highlights",
      "shadows",
      "whites",
      "blacks",
      "temperature",
      "tint",
      "saturation",
      "vibrance",
    ]);
  });

  it("creates independent neutral adjustment objects", () => {
    const first = createDefaultAdjustments();
    const second = createDefaultAdjustments();
    first.exposure = 1;
    expect(second.exposure).toBe(0);
    expect(isEdited(first)).toBe(true);
    expect(isEdited(second)).toBe(false);
  });

  it("clamps and rounds values to their declared range", () => {
    expect(clampAdjustment("exposure", 9)).toBe(5);
    expect(clampAdjustment("exposure", 0.126)).toBe(0.13);
    expect(clampAdjustment("contrast", -500)).toBe(-100);
    expect(clampAdjustment("vibrance", 42.8)).toBe(43);
  });

  it("keeps gradient geometry resolution-independent and marks masks as edits", () => {
    expect(clampGradientGeometry({ startX: -1, startY: 0.123456, endX: 2, endY: 0.75, feather: 4 })).toEqual({
      startX: -1,
      startY: 0.1235,
      endX: 2,
      endY: 0.75,
      feather: 1,
    });
    const state = createDefaultEditState();
    expect(isEdited(state)).toBe(false);
    state.masks.push({
      id: "mask",
      type: "linear-gradient",
      name: "Linear Gradient 1",
      startX: 0.5,
      startY: 0,
      endX: 0.5,
      endY: 0.4,
      feather: 0.65,
      adjustments: createDefaultAdjustments(),
    });
    expect(isEdited(state)).toBe(true);
  });

  it("defines neutral Lightroom-style develop groups and independent curve data", () => {
    expect(EFFECT_DEFINITIONS.map((item) => item.key)).toContain("grain");
    expect(DETAIL_DEFINITIONS.map((item) => item.key)).toContain("colorNoise");
    const state = createDefaultEditState();
    const second = createDefaultEditState();
    state.toneCurve.rgb[1].y = 0.7;
    state.colorMix.blue.saturation = -25;
    expect(second.toneCurve).toEqual(createDefaultToneCurve());
    expect(second.colorMix).toEqual(createDefaultColorMix());
    expect(isEdited(state)).toBe(true);
  });

  it("normalizes legacy edit state and clamps curve points", () => {
    const legacy = normalizeEditState({ adjustments: { ...createDefaultAdjustments(), exposure: 1 } });
    expect(legacy.toneCurve.rgb).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
    expect(legacy.effects.vignetteMidpoint).toBe(50);
    expect(legacy.detail.sharpeningRadius).toBe(1);
    expect(normalizeCurvePoints([-2, 0.2, 0.56789, 0.8, 4])).toEqual([
      { x: 0, y: 0 },
      { x: 0.25, y: 0.2 },
      { x: 0.5, y: 0.5679 },
      { x: 0.75, y: 0.8 },
      { x: 1, y: 1 },
    ]);
    expect(evaluateToneCurve([{ x: 0, y: 0.1 }, { x: 0.4, y: 0.7 }, { x: 1, y: 0.9 }], 0.2)).toBeCloseTo(0.4);
    expect(normalizeCurvePoints([{ x: 0.15, y: 0.2 }, { x: 0.82, y: 0.9 }])).toEqual([
      { x: 0.15, y: 0.2 },
      { x: 0.82, y: 0.9 },
    ]);
  });
});
