export type Actor = "user" | "agent";

export type AdjustmentKey =
  | "exposure"
  | "contrast"
  | "highlights"
  | "shadows"
  | "whites"
  | "blacks"
  | "temperature"
  | "tint"
  | "saturation"
  | "vibrance";

export type AdjustmentValues = Record<AdjustmentKey, number>;

export type CurveChannel = "rgb" | "red" | "green" | "blue";
export type ToneCurve = Record<CurveChannel, [number, number, number, number, number]>;

export type ColorMixChannel =
  | "red" | "orange" | "yellow" | "green"
  | "aqua" | "blue" | "purple" | "magenta";

export interface ColorMixValues {
  hue: number;
  saturation: number;
  luminance: number;
}

export type ColorMix = Record<ColorMixChannel, ColorMixValues>;

export type ColorGradeRange = "shadows" | "midtones" | "highlights" | "global";

export interface ColorGradeWheel {
  hue: number;
  saturation: number;
  luminance: number;
}

export interface ColorGrading {
  shadows: ColorGradeWheel;
  midtones: ColorGradeWheel;
  highlights: ColorGradeWheel;
  global: ColorGradeWheel;
  blending: number;
  balance: number;
}

export interface EffectValues {
  texture: number;
  clarity: number;
  dehaze: number;
  vignette: number;
  vignetteMidpoint: number;
  vignetteRoundness: number;
  vignetteFeather: number;
  grain: number;
  grainSize: number;
  grainRoughness: number;
}

export interface DetailValues {
  sharpening: number;
  sharpeningRadius: number;
  sharpeningDetail: number;
  sharpeningMasking: number;
  luminanceNoise: number;
  luminanceDetail: number;
  luminanceContrast: number;
  colorNoise: number;
  colorNoiseDetail: number;
  colorNoiseSmoothness: number;
}

export interface LinearGradientMask {
  id: string;
  type: "linear-gradient";
  name: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  feather: number;
  adjustments: AdjustmentValues;
}

export interface PhotoEditState {
  adjustments: AdjustmentValues;
  toneCurve: ToneCurve;
  colorMix: ColorMix;
  colorGrading: ColorGrading;
  effects: EffectValues;
  detail: DetailValues;
  masks: LinearGradientMask[];
}

export interface PhotoRecord {
  id: string;
  order: number;
  name: string;
  mimeType: "image/jpeg" | "image/png";
  size: number;
  width: number;
  height: number;
  createdAt: number;
  updatedAt: number;
  editState: PhotoEditState;
  historyCursor: number;
}

export interface PhotoAssetRecord {
  photoId: string;
  original: Blob;
  preview: Blob;
  thumbnail: Blob;
}

export type HistoryEventType =
  | "adjustment.changed"
  | "adjustments.reset"
  | "mask.created"
  | "mask.geometry.changed"
  | "mask.adjustment.changed"
  | "mask.deleted"
  | "curve.changed"
  | "colorMix.changed"
  | "colorGrading.changed"
  | "effect.changed"
  | "detail.changed";

export interface HistoryEvent {
  id: string;
  photoId: string;
  sequence: number;
  actor: Actor;
  timestamp: number;
  type: HistoryEventType;
  before: PhotoEditState;
  after: PhotoEditState;
  payload: {
    property?: string;
    previousValue?: number;
    nextValue?: number;
    label?: string;
    maskId?: string;
    maskName?: string;
  };
}

export interface WorkspaceRecord {
  id: "current";
  selectedPhotoId: string | null;
  updatedAt: number;
}

export interface RuntimePhoto extends PhotoRecord {
  previewUrl: string;
  thumbnailUrl: string;
}

export type SaveStatus = "idle" | "saving" | "saved" | "error";
