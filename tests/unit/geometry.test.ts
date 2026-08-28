import { describe, expect, it } from "vitest";

import {
  applyCropAspectPreset,
  createDefaultGeometry,
  geometryPointToSource,
  getGeometryOutputDimensions,
  getSafeCropBounds,
  isGeometryEdited,
  normalizeGeometry,
  rotateGeometryClockwise,
  sourcePointToGeometry,
} from "@/editor/domain/geometry";

describe("crop and geometry domain", () => {
  it("keeps source and transformed coordinates reversible", () => {
    const geometry = normalizeGeometry({
      ...createDefaultGeometry(),
      rotation: 90,
      straighten: 12.5,
      flipHorizontal: true,
      crop: { x: 0.2, y: 0.15, width: 0.6, height: 0.7 },
    }, 1200, 800);
    const source = { x: 0.23, y: 0.71 };
    const transformed = sourcePointToGeometry(source, geometry, 1200, 800);
    const restored = geometryPointToSource(transformed, geometry, 1200, 800);
    expect(restored.x).toBeCloseTo(source.x, 8);
    expect(restored.y).toBeCloseTo(source.y, 8);
  });

  it("applies crop presets in oriented pixel space", () => {
    const wide = applyCropAspectPreset(createDefaultGeometry(), "16:9", 1200, 800);
    expect(getGeometryOutputDimensions(1200, 800, wide)).toEqual({ width: 1200, height: 675 });
    const square = applyCropAspectPreset(createDefaultGeometry(), "1:1", 1200, 800);
    expect(getGeometryOutputDimensions(1200, 800, square)).toEqual({ width: 800, height: 800 });
  });

  it("rotates the crop with the image and constrains straighten to valid pixels", () => {
    const cropped = { ...createDefaultGeometry(), crop: { x: 0.1, y: 0.2, width: 0.6, height: 0.5 } };
    expect(rotateGeometryClockwise(cropped)).toMatchObject({
      rotation: 90,
      crop: { x: 0.3, y: 0.1, width: 0.5, height: 0.6 },
    });
    const safe = getSafeCropBounds(1200, 800, { rotation: 0, straighten: 20 });
    expect(safe.width).toBeLessThan(1);
    expect(safe.height).toBeLessThan(1);
    const normalized = normalizeGeometry({ ...createDefaultGeometry(), straighten: 20 }, 1200, 800);
    expect(normalized.crop).toEqual(safe);
    expect(isGeometryEdited(normalized)).toBe(true);
  });
});
