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
export interface CurvePoint {
  x: number;
  y: number;
}
export type ToneCurve = Record<CurveChannel, CurvePoint[]>;

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

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type QuarterRotation = 0 | 90 | 180 | 270;

export interface GeometryValues {
  crop: CropRect;
  rotation: QuarterRotation;
  straighten: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
}

interface BaseMask {
  id: string;
  name: string;
  inverted: boolean;
  adjustments: AdjustmentValues;
}

export interface LinearGradientMask extends BaseMask {
  type: "linear-gradient";
  feather: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface RadialGradientMask extends BaseMask {
  type: "radial-gradient";
  feather: number;
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
}

export interface BrushPoint {
  x: number;
  y: number;
}

export interface BrushStroke {
  id: string;
  mode: "add" | "erase";
  size: number;
  feather: number;
  flow: number;
  points: BrushPoint[];
}

export interface BrushMask extends BaseMask {
  type: "brush";
  size: number;
  feather: number;
  flow: number;
  density: number;
  strokes: BrushStroke[];
}

export type EditorMask = LinearGradientMask | RadialGradientMask | BrushMask;

export interface PhotoEditState {
  adjustments: AdjustmentValues;
  geometry: GeometryValues;
  toneCurve: ToneCurve;
  colorMix: ColorMix;
  colorGrading: ColorGrading;
  effects: EffectValues;
  detail: DetailValues;
  masks: EditorMask[];
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
  | "detail.changed"
  | "geometry.changed";

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
