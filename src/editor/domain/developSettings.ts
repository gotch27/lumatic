import type {
  ColorGradeRange,
  ColorGrading,
  ColorMix,
  ColorMixChannel,
  CurveChannel,
  CurvePoint,
  DetailValues,
  EffectValues,
  ToneCurve,
} from "./types";

export interface DevelopSliderDefinition<K extends string = string> {
  key: K;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
}

export const CURVE_CHANNELS: Array<{ key: CurveChannel; label: string; color: string }> = [
  { key: "rgb", label: "RGB", color: "#e4e4e7" },
  { key: "red", label: "Red", color: "#fb7185" },
  { key: "green", label: "Green", color: "#4ade80" },
  { key: "blue", label: "Blue", color: "#60a5fa" },
];

export const MAX_TONE_CURVE_POINTS = 5;
export const MIN_CURVE_POINT_GAP = 0.005;

export const COLOR_MIX_CHANNELS: Array<{ key: ColorMixChannel; label: string; color: string }> = [
  { key: "red", label: "Red", color: "#ef4444" },
  { key: "orange", label: "Orange", color: "#f97316" },
  { key: "yellow", label: "Yellow", color: "#eab308" },
  { key: "green", label: "Green", color: "#22c55e" },
  { key: "aqua", label: "Aqua", color: "#06b6d4" },
  { key: "blue", label: "Blue", color: "#3b82f6" },
  { key: "purple", label: "Purple", color: "#a855f7" },
  { key: "magenta", label: "Magenta", color: "#ec4899" },
];

export const COLOR_GRADE_RANGES: Array<{ key: ColorGradeRange; label: string }> = [
  { key: "shadows", label: "Shadows" },
  { key: "midtones", label: "Midtones" },
  { key: "highlights", label: "Highlights" },
  { key: "global", label: "Global" },
];

export const EFFECT_DEFINITIONS: DevelopSliderDefinition<keyof EffectValues>[] = [
  { key: "texture", label: "Texture", min: -100, max: 100, step: 1, defaultValue: 0 },
  { key: "clarity", label: "Clarity", min: -100, max: 100, step: 1, defaultValue: 0 },
  { key: "dehaze", label: "Dehaze", min: -100, max: 100, step: 1, defaultValue: 0 },
  { key: "vignette", label: "Vignette", min: -100, max: 100, step: 1, defaultValue: 0 },
  { key: "vignetteMidpoint", label: "Midpoint", min: 0, max: 100, step: 1, defaultValue: 50 },
  { key: "vignetteRoundness", label: "Roundness", min: -100, max: 100, step: 1, defaultValue: 0 },
  { key: "vignetteFeather", label: "Feather", min: 0, max: 100, step: 1, defaultValue: 50 },
  { key: "grain", label: "Grain", min: 0, max: 100, step: 1, defaultValue: 0 },
  { key: "grainSize", label: "Size", min: 0, max: 100, step: 1, defaultValue: 25 },
  { key: "grainRoughness", label: "Roughness", min: 0, max: 100, step: 1, defaultValue: 50 },
];

export const DETAIL_DEFINITIONS: DevelopSliderDefinition<keyof DetailValues>[] = [
  { key: "sharpening", label: "Sharpening", min: 0, max: 150, step: 1, defaultValue: 0 },
  { key: "sharpeningRadius", label: "Radius", min: 0.5, max: 3, step: 0.1, defaultValue: 1 },
  { key: "sharpeningDetail", label: "Detail", min: 0, max: 100, step: 1, defaultValue: 25 },
  { key: "sharpeningMasking", label: "Masking", min: 0, max: 100, step: 1, defaultValue: 0 },
  { key: "luminanceNoise", label: "Noise Reduction", min: 0, max: 100, step: 1, defaultValue: 0 },
  { key: "luminanceDetail", label: "Detail", min: 0, max: 100, step: 1, defaultValue: 50 },
  { key: "luminanceContrast", label: "Contrast", min: 0, max: 100, step: 1, defaultValue: 0 },
  { key: "colorNoise", label: "Color Noise Reduction", min: 0, max: 100, step: 1, defaultValue: 0 },
  { key: "colorNoiseDetail", label: "Detail", min: 0, max: 100, step: 1, defaultValue: 50 },
  { key: "colorNoiseSmoothness", label: "Smoothness", min: 0, max: 100, step: 1, defaultValue: 50 },
];

export const COLOR_MIX_PROPERTIES: DevelopSliderDefinition<"hue" | "saturation" | "luminance">[] = [
  { key: "hue", label: "Hue", min: -100, max: 100, step: 1, defaultValue: 0 },
  { key: "saturation", label: "Saturation", min: -100, max: 100, step: 1, defaultValue: 0 },
  { key: "luminance", label: "Luminance", min: -100, max: 100, step: 1, defaultValue: 0 },
];

export function createDefaultToneCurve(): ToneCurve {
  const identity = (): CurvePoint[] => [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  return {
    rgb: identity(),
    red: identity(),
    green: identity(),
    blue: identity(),
  };
}

export function createDefaultColorMix(): ColorMix {
  return Object.fromEntries(COLOR_MIX_CHANNELS.map(({ key }) => [key, {
    hue: 0,
    saturation: 0,
    luminance: 0,
  }])) as unknown as ColorMix;
}

export function createDefaultColorGrading(): ColorGrading {
  const wheel = () => ({ hue: 0, saturation: 0, luminance: 0 });
  return {
    shadows: wheel(),
    midtones: wheel(),
    highlights: wheel(),
    global: wheel(),
    blending: 50,
    balance: 0,
  };
}

export function createDefaultEffects(): EffectValues {
  return Object.fromEntries(EFFECT_DEFINITIONS.map(({ key, defaultValue }) => [key, defaultValue])) as unknown as EffectValues;
}

export function createDefaultDetail(): DetailValues {
  return Object.fromEntries(DETAIL_DEFINITIONS.map(({ key, defaultValue }) => [key, defaultValue])) as unknown as DetailValues;
}

export function clampDevelopValue(definition: DevelopSliderDefinition, value: number): number {
  const clamped = Math.min(definition.max, Math.max(definition.min, Number.isFinite(value) ? value : definition.defaultValue));
  const decimals = definition.step < 1 ? 1 : 0;
  return Number(clamped.toFixed(decimals));
}

function normalizeCoordinate(value: number, fallback: number): number {
  const finite = Number.isFinite(value) ? value : fallback;
  return Number(Math.min(1, Math.max(0, finite)).toFixed(4));
}

function simplifyLegacyPoints(points: CurvePoint[]): CurvePoint[] {
  if (points.length <= 2) return points;
  return points.filter((point, index) => {
    if (index === 0 || index === points.length - 1) return true;
    const previous = points[index - 1];
    const next = points[index + 1];
    const expected = previous.y + ((point.x - previous.x) / (next.x - previous.x)) * (next.y - previous.y);
    return Math.abs(point.y - expected) > 0.0001;
  });
}

export function normalizeCurvePoints(input: unknown): CurvePoint[] {
  if (!Array.isArray(input) || input.length < 2) return [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  const legacy = input.every((value) => typeof value === "number");
  const source: CurvePoint[] = legacy
    ? input.map((value, index) => ({
      x: input.length === 1 ? 0 : index / (input.length - 1),
      y: typeof value === "number" ? value : index / Math.max(1, input.length - 1),
    }))
    : input.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const point = value as Partial<CurvePoint>;
      return typeof point.x === "number" && typeof point.y === "number" ? [{ x: point.x, y: point.y }] : [];
    });
  const sorted = source
    .map((point) => ({ x: normalizeCoordinate(point.x, 0), y: normalizeCoordinate(point.y, point.x) }))
    .sort((a, b) => a.x - b.x)
    .filter((point, index, points) => index === 0 || point.x - points[index - 1].x >= MIN_CURVE_POINT_GAP)
    .slice(0, MAX_TONE_CURVE_POINTS);
  if (sorted.length < 2) return [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  if (legacy) {
    sorted[0] = { ...sorted[0], x: 0 };
    sorted[sorted.length - 1] = { ...sorted[sorted.length - 1], x: 1 };
  }
  const normalized = sorted.filter((point, index, points) => index === 0 || point.x > points[index - 1].x);
  if (normalized.length < 2) return [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  return legacy ? simplifyLegacyPoints(normalized) : normalized;
}

export function evaluateToneCurve(points: readonly CurvePoint[], input: number): number {
  const normalized = normalizeCurvePoints(points);
  const x = Math.min(1, Math.max(0, input));
  if (x <= normalized[0].x) return normalized[0].y;
  for (let index = 1; index < normalized.length; index += 1) {
    const right = normalized[index];
    if (x <= right.x) {
      const left = normalized[index - 1];
      const progress = (x - left.x) / Math.max(0.0001, right.x - left.x);
      return left.y + (right.y - left.y) * progress;
    }
  }
  return normalized[normalized.length - 1].y;
}

export function cloneToneCurve(curve: ToneCurve): ToneCurve {
  return {
    rgb: curve.rgb.map((point) => ({ ...point })),
    red: curve.red.map((point) => ({ ...point })),
    green: curve.green.map((point) => ({ ...point })),
    blue: curve.blue.map((point) => ({ ...point })),
  };
}

export function cloneColorMix(colorMix: ColorMix): ColorMix {
  return Object.fromEntries(COLOR_MIX_CHANNELS.map(({ key }) => [key, { ...colorMix[key] }])) as unknown as ColorMix;
}

export function cloneColorGrading(grading: ColorGrading): ColorGrading {
  return {
    shadows: { ...grading.shadows },
    midtones: { ...grading.midtones },
    highlights: { ...grading.highlights },
    global: { ...grading.global },
    blending: grading.blending,
    balance: grading.balance,
  };
}

export function hasDevelopEdits(
  toneCurve: ToneCurve,
  colorMix: ColorMix,
  grading: ColorGrading,
  effects: EffectValues,
  detail: DetailValues,
): boolean {
  return JSON.stringify(toneCurve) !== JSON.stringify(createDefaultToneCurve())
    || JSON.stringify(colorMix) !== JSON.stringify(createDefaultColorMix())
    || JSON.stringify(grading) !== JSON.stringify(createDefaultColorGrading())
    || JSON.stringify(effects) !== JSON.stringify(createDefaultEffects())
    || JSON.stringify(detail) !== JSON.stringify(createDefaultDetail());
}
