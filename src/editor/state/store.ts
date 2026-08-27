import { create } from "zustand";

import type {
  AdjustmentKey,
  HistoryEvent,
  LinearGradientMask,
  RuntimePhoto,
  SaveStatus,
} from "@/editor/domain/types";

export type EditorDraft =
  | { kind: "global-adjustment"; photoId: string; key: AdjustmentKey; baselineValue: number }
  | { kind: "mask-adjustment"; photoId: string; maskId: string; key: AdjustmentKey; baselineValue: number }
  | { kind: "mask-geometry"; photoId: string; maskId: string; baseline: LinearGradientMask | null };

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
  maskToolMode: "idle" | "create-linear";
  saveStatus: SaveStatus;
  isImporting: boolean;
  importCompleted: number;
  importTotal: number;
  storageUsage: number | null;
  storageQuota: number | null;
  persistentStorage: boolean | null;
  showOriginal: boolean;
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
  saveStatus: "idle",
  isImporting: false,
  importCompleted: 0,
  importTotal: 0,
  storageUsage: null,
  storageQuota: null,
  persistentStorage: null,
  showOriginal: false,
  exportProgress: null,
  exportLabel: null,
  notices: [],
};

export const useEditorStore = create<EditorStore>(() => initialEditorState);

export function selectedPhotoFromState(state: EditorStore): RuntimePhoto | null {
  return state.photos.find((photo) => photo.id === state.selectedPhotoId) ?? null;
}
