import { clampGradientGeometry, createDefaultAdjustments } from "./adjustments";
import type { LinearGradientMask, RadialGradientMask } from "./types";

export const MAX_GRADIENT_MASKS = 8;

export type LinearGradientGeometry = Pick<
  LinearGradientMask,
  "startX" | "startY" | "endX" | "endY" | "feather"
>;

export function createLinearGradientMask(
  id: string,
  index: number,
  startX: number,
  startY: number,
): LinearGradientMask {
  const geometry = clampGradientGeometry({
    startX,
    startY,
    endX: startX,
    endY: Math.min(1, startY + 0.25),
    feather: 0.65,
  });
  return {
    id,
    type: "linear-gradient",
    name: `Linear Gradient ${index}`,
    inverted: false,
    ...geometry,
    adjustments: createDefaultAdjustments(),
  };
}

export type RadialGradientGeometry = Pick<
  RadialGradientMask,
  "centerX" | "centerY" | "radiusX" | "radiusY" | "feather"
>;

export function createRadialGradientMask(
  id: string,
  index: number,
  centerX: number,
  centerY: number,
): RadialGradientMask {
  return {
    id,
    type: "radial-gradient",
    name: `Radial Gradient ${index}`,
    inverted: false,
    centerX,
    centerY,
    radiusX: 0.15,
    radiusY: 0.15,
    feather: 0.65,
    adjustments: createDefaultAdjustments(),
  };
}

export function getGradientGeometry(mask: LinearGradientMask): LinearGradientGeometry {
  return {
    startX: mask.startX,
    startY: mask.startY,
    endX: mask.endX,
    endY: mask.endY,
    feather: mask.feather,
  };
}

export function sameGradientGeometry(a: LinearGradientGeometry, b: LinearGradientGeometry): boolean {
  return a.startX === b.startX
    && a.startY === b.startY
    && a.endX === b.endX
    && a.endY === b.endY
    && a.feather === b.feather;
}

export function getRadialGradientGeometry(mask: RadialGradientMask): RadialGradientGeometry {
  return {
    centerX: mask.centerX,
    centerY: mask.centerY,
    radiusX: mask.radiusX,
    radiusY: mask.radiusY,
    feather: mask.feather,
  };
}

export function sameRadialGradientGeometry(a: RadialGradientGeometry, b: RadialGradientGeometry): boolean {
  return a.centerX === b.centerX
    && a.centerY === b.centerY
    && a.radiusX === b.radiusX
    && a.radiusY === b.radiusY
    && a.feather === b.feather;
}
