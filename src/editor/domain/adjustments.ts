import type { AdjustmentKey, AdjustmentValues, EditorMask, LinearGradientMask, PhotoEditState } from "./types";
import {
  cloneColorGrading,
  cloneColorMix,
  cloneToneCurve,
  createDefaultColorGrading,
  createDefaultColorMix,
  createDefaultDetail,
  createDefaultEffects,
  createDefaultToneCurve,
  hasDevelopEdits,
  normalizeCurvePoints,
} from "./developSettings";

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
  return {
    adjustments: createDefaultAdjustments(),
    toneCurve: createDefaultToneCurve(),
    colorMix: createDefaultColorMix(),
    colorGrading: createDefaultColorGrading(),
    effects: createDefaultEffects(),
    detail: createDefaultDetail(),
    masks: [],
  };
}

export function cloneMask<T extends EditorMask>(mask: T): T {
  if (mask.type === "brush") {
    return {
      ...mask,
      adjustments: { ...mask.adjustments },
      strokes: mask.strokes.map((stroke) => ({
        ...stroke,
        points: stroke.points.map((point) => ({ ...point })),
      })),
    } as T;
  }
  return { ...mask, adjustments: { ...mask.adjustments } } as T;
}

export function cloneEditState(editState: PhotoEditState): PhotoEditState {
  return {
    adjustments: { ...editState.adjustments },
    toneCurve: cloneToneCurve(editState.toneCurve),
    colorMix: cloneColorMix(editState.colorMix),
    colorGrading: cloneColorGrading(editState.colorGrading),
    effects: { ...editState.effects },
    detail: { ...editState.detail },
    masks: editState.masks.map(cloneMask),
  };
}

export function normalizeEditState(editState: Partial<PhotoEditState> | undefined): PhotoEditState {
  const defaultCurve = createDefaultToneCurve();
  const storedCurve = editState?.toneCurve;
  const defaultMix = createDefaultColorMix();
  const storedMix = editState?.colorMix;
  const defaultGrading = createDefaultColorGrading();
  const storedGrading = editState?.colorGrading;
  return {
    adjustments: { ...DEFAULT_ADJUSTMENTS, ...(editState?.adjustments ?? {}) },
    toneCurve: {
      rgb: normalizeCurvePoints(storedCurve?.rgb ?? defaultCurve.rgb),
      red: normalizeCurvePoints(storedCurve?.red ?? defaultCurve.red),
      green: normalizeCurvePoints(storedCurve?.green ?? defaultCurve.green),
      blue: normalizeCurvePoints(storedCurve?.blue ?? defaultCurve.blue),
    },
    colorMix: Object.fromEntries(Object.keys(defaultMix).map((key) => [key, {
      ...defaultMix[key as keyof typeof defaultMix],
      ...(storedMix?.[key as keyof typeof storedMix] ?? {}),
    }])) as PhotoEditState["colorMix"],
    colorGrading: {
      shadows: { ...defaultGrading.shadows, ...(storedGrading?.shadows ?? {}) },
      midtones: { ...defaultGrading.midtones, ...(storedGrading?.midtones ?? {}) },
      highlights: { ...defaultGrading.highlights, ...(storedGrading?.highlights ?? {}) },
      global: { ...defaultGrading.global, ...(storedGrading?.global ?? {}) },
      blending: storedGrading?.blending ?? defaultGrading.blending,
      balance: storedGrading?.balance ?? defaultGrading.balance,
    },
    effects: { ...createDefaultEffects(), ...(editState?.effects ?? {}) },
    detail: { ...createDefaultDetail(), ...(editState?.detail ?? {}) },
    masks: (editState?.masks ?? []).flatMap<EditorMask>((mask) => {
      const shared = {
        ...mask,
        inverted: mask.inverted === true,
        adjustments: { ...DEFAULT_ADJUSTMENTS, ...mask.adjustments },
      };
      if (mask.type === "brush") {
        return [{
          ...shared,
          type: "brush" as const,
          size: Math.max(0.01, clampNormalized(mask.size ?? 0.18)),
          feather: clampNormalized(mask.feather ?? 0.5),
          flow: Math.max(0.01, clampNormalized(mask.flow ?? 0.5)),
          density: Math.max(0.01, clampNormalized(mask.density ?? 1)),
          strokes: (mask.strokes ?? []).map((stroke) => ({
            ...stroke,
            mode: stroke.mode === "erase" ? "erase" as const : "add" as const,
            size: Math.max(0.01, clampNormalized(stroke.size ?? mask.size ?? 0.18)),
            feather: clampNormalized(stroke.feather ?? mask.feather ?? 0.5),
            flow: Math.max(0.01, clampNormalized(stroke.flow ?? mask.flow ?? 0.5)),
            points: (stroke.points ?? []).map((point) => ({
              x: roundGradientCoordinate(point.x),
              y: roundGradientCoordinate(point.y),
            })),
          })).filter((stroke) => stroke.points.length > 0),
        }];
      }
      if (mask.type === "radial-gradient") {
        return [{
          ...shared,
          type: "radial-gradient" as const,
          feather: clampNormalized(mask.feather ?? 0.65),
          centerX: roundGradientCoordinate(mask.centerX),
          centerY: roundGradientCoordinate(mask.centerY),
          radiusX: Math.max(0.005, Math.abs(roundGradientCoordinate(mask.radiusX))),
          radiusY: Math.max(0.005, Math.abs(roundGradientCoordinate(mask.radiusY))),
        }];
      }
      if (mask.type !== "linear-gradient") return [];
      return [{
        ...shared,
        type: "linear-gradient" as const,
        feather: clampNormalized(mask.feather ?? 0.65),
        startX: roundGradientCoordinate(mask.startX),
        startY: roundGradientCoordinate(mask.startY),
        endX: roundGradientCoordinate(mask.endX),
        endY: roundGradientCoordinate(mask.endY),
      }];
    }),
  };
}

export function isEdited(editStateOrAdjustments: PhotoEditState | AdjustmentValues): boolean {
  const editState = "masks" in editStateOrAdjustments
    ? editStateOrAdjustments
    : { ...createDefaultEditState(), adjustments: editStateOrAdjustments };
  return editState.masks.length > 0
    || ADJUSTMENT_DEFINITIONS.some(({ key }) => editState.adjustments[key] !== DEFAULT_ADJUSTMENTS[key])
    || hasDevelopEdits(editState.toneCurve, editState.colorMix, editState.colorGrading, editState.effects, editState.detail);
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

function roundGradientCoordinate(value: number): number {
  return Number(value.toFixed(4));
}

export function clampGradientGeometry(
  geometry: Pick<LinearGradientMask, "startX" | "startY" | "endX" | "endY" | "feather">,
) {
  return {
    startX: roundGradientCoordinate(geometry.startX),
    startY: roundGradientCoordinate(geometry.startY),
    endX: roundGradientCoordinate(geometry.endX),
    endY: roundGradientCoordinate(geometry.endY),
    feather: clampNormalized(geometry.feather),
  };
}
