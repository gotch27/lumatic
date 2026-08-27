import type { AdjustmentKey, AdjustmentValues, LinearGradientMask, PhotoEditState } from "./types";

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

export function createDefaultEditState(): PhotoEditState {
  return { adjustments: createDefaultAdjustments(), masks: [] };
}

export function cloneMask(mask: LinearGradientMask): LinearGradientMask {
  return { ...mask, adjustments: { ...mask.adjustments } };
}

export function cloneEditState(editState: PhotoEditState): PhotoEditState {
  return {
    adjustments: { ...editState.adjustments },
    masks: editState.masks.map(cloneMask),
  };
}

export function normalizeEditState(editState: Partial<PhotoEditState> | undefined): PhotoEditState {
  return {
    adjustments: { ...DEFAULT_ADJUSTMENTS, ...(editState?.adjustments ?? {}) },
    masks: (editState?.masks ?? []).map((mask) => ({
      ...mask,
      adjustments: { ...DEFAULT_ADJUSTMENTS, ...mask.adjustments },
    })),
  };
}

export function isEdited(editStateOrAdjustments: PhotoEditState | AdjustmentValues): boolean {
  const editState = "masks" in editStateOrAdjustments
    ? editStateOrAdjustments
    : { adjustments: editStateOrAdjustments, masks: [] };
  return editState.masks.length > 0
    || ADJUSTMENT_DEFINITIONS.some(({ key }) => editState.adjustments[key] !== DEFAULT_ADJUSTMENTS[key]);
}

export function clampAdjustment(key: AdjustmentKey, value: number): number {
  const definition = ADJUSTMENT_BY_KEY[key];
  const clamped = Math.min(definition.max, Math.max(definition.min, value));
  const decimals = definition.step < 1 ? 2 : 0;
  return Number(clamped.toFixed(decimals));
}

export function clampNormalized(value: number): number {
  return Number(Math.min(1, Math.max(0, value)).toFixed(4));
}

export function clampGradientGeometry(
  geometry: Pick<LinearGradientMask, "startX" | "startY" | "endX" | "endY" | "feather">,
) {
  return {
    startX: clampNormalized(geometry.startX),
    startY: clampNormalized(geometry.startY),
    endX: clampNormalized(geometry.endX),
    endY: clampNormalized(geometry.endY),
    feather: clampNormalized(geometry.feather),
  };
}
