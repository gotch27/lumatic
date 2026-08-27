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
  | "mask.deleted";

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
    property?: AdjustmentKey;
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
