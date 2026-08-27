import { describe, expect, it } from "vitest";

import {
  ADJUSTMENT_DEFINITIONS,
  clampAdjustment,
  clampGradientGeometry,
  createDefaultAdjustments,
  createDefaultEditState,
  isEdited,
} from "@/editor/domain/adjustments";

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
      startX: 0,
      startY: 0.1235,
      endX: 1,
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
});
