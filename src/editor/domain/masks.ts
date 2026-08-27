import { clampGradientGeometry, createDefaultAdjustments } from "./adjustments";
import type { LinearGradientMask } from "./types";

export const MAX_LINEAR_GRADIENTS = 8;

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
    ...geometry,
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
