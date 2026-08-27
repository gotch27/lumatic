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

export interface PhotoEditState {
  adjustments: AdjustmentValues;
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

export type HistoryEventType = "adjustment.changed" | "adjustments.reset";

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
