import type { AdjustmentKey, AdjustmentValues } from "./types";

export interface AdjustmentDefinition {
  key: AdjustmentKey;
  label: string;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  group: "light" | "color";
}

export const DEFAULT_ADJUSTMENTS: AdjustmentValues = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  temperature: 0,
  tint: 0,
  saturation: 0,
  vibrance: 0,
};

export const ADJUSTMENT_DEFINITIONS: AdjustmentDefinition[] = [
  { key: "exposure", label: "Exposure", min: -5, max: 5, step: 0.05, suffix: " EV", group: "light" },
  { key: "contrast", label: "Contrast", min: -100, max: 100, step: 1, group: "light" },
  { key: "highlights", label: "Highlights", min: -100, max: 100, step: 1, group: "light" },
  { key: "shadows", label: "Shadows", min: -100, max: 100, step: 1, group: "light" },
  { key: "whites", label: "Whites", min: -100, max: 100, step: 1, group: "light" },
  { key: "blacks", label: "Blacks", min: -100, max: 100, step: 1, group: "light" },
  { key: "temperature", label: "Temperature", min: -100, max: 100, step: 1, group: "color" },
  { key: "tint", label: "Tint", min: -100, max: 100, step: 1, group: "color" },
  { key: "saturation", label: "Saturation", min: -100, max: 100, step: 1, group: "color" },
  { key: "vibrance", label: "Vibrance", min: -100, max: 100, step: 1, group: "color" },
];

export const ADJUSTMENT_BY_KEY = Object.fromEntries(
  ADJUSTMENT_DEFINITIONS.map((definition) => [definition.key, definition]),
) as Record<AdjustmentKey, AdjustmentDefinition>;

export function createDefaultAdjustments(): AdjustmentValues {
  return { ...DEFAULT_ADJUSTMENTS };
}

export function cloneEditState(adjustments: AdjustmentValues) {
  return { adjustments: { ...adjustments } };
}

export function isEdited(adjustments: AdjustmentValues): boolean {
  return ADJUSTMENT_DEFINITIONS.some(({ key }) => adjustments[key] !== DEFAULT_ADJUSTMENTS[key]);
}

export function clampAdjustment(key: AdjustmentKey, value: number): number {
  const definition = ADJUSTMENT_BY_KEY[key];
  const clamped = Math.min(definition.max, Math.max(definition.min, value));
  const decimals = definition.step < 1 ? 2 : 0;
  return Number(clamped.toFixed(decimals));
}
