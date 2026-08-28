import { create } from "zustand";

import type {
  AdjustmentKey,
  HistoryEvent,
  EditorMask,
  PhotoEditState,
  RuntimePhoto,
  SaveStatus,
} from "@/editor/domain/types";
import type { HistogramData } from "@/editor/imaging/histogram";

export type EditorDraft =
  | { kind: "global-adjustment"; photoId: string; key: AdjustmentKey; baselineValue: number }
  | { kind: "mask-adjustment"; photoId: string; maskId: string; key: AdjustmentKey; baselineValue: number }
  | { kind: "mask-geometry"; photoId: string; maskId: string; baseline: EditorMask | null }
  | { kind: "develop-setting"; photoId: string; target: string; baseline: PhotoEditState };

export interface Notice {
  id: string;
  tone: "info" | "success" | "error";
  message: string;
}

export interface EditorStore {
  hydrated: boolean;
  photos: RuntimePhoto[];
  selectedPhotoId: string | null;
  historyByPhoto: Record<string, HistoryEvent[]>;
  draft: EditorDraft | null;
  selectedMaskId: string | null;
  maskToolMode: "idle" | "create-linear" | "create-radial" | "paint-brush";
  geometryToolMode: "idle" | "crop" | "straighten";
  brushPaintMode: "add" | "erase";
  saveStatus: SaveStatus;
  isImporting: boolean;
  importCompleted: number;
  importTotal: number;
  storageUsage: number | null;
  storageQuota: number | null;
  persistentStorage: boolean | null;
  showOriginal: boolean;
  histogramPhotoId: string | null;
  histogram: HistogramData | null;
  showShadowClipping: boolean;
  showHighlightClipping: boolean;
  exportProgress: number | null;
  exportLabel: string | null;
  notices: Notice[];
}

export const initialEditorState: EditorStore = {
  hydrated: false,
  photos: [],
  selectedPhotoId: null,
  historyByPhoto: {},
  draft: null,
  selectedMaskId: null,
  maskToolMode: "idle",
  geometryToolMode: "idle",
  brushPaintMode: "add",
  saveStatus: "idle",
  isImporting: false,
  importCompleted: 0,
  importTotal: 0,
  storageUsage: null,
  storageQuota: null,
  persistentStorage: null,
  showOriginal: false,
  histogramPhotoId: null,
  histogram: null,
  showShadowClipping: false,
  showHighlightClipping: false,
  exportProgress: null,
  exportLabel: null,
  notices: [],
};

export const useEditorStore = create<EditorStore>(() => initialEditorState);

export function selectedPhotoFromState(state: EditorStore): RuntimePhoto | null {
  return state.photos.find((photo) => photo.id === state.selectedPhotoId) ?? null;
}
