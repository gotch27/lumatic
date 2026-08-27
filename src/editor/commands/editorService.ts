import { createDefaultAdjustments, clampAdjustment, cloneEditState } from "@/editor/domain/adjustments";
import type {
  Actor,
  AdjustmentKey,
  HistoryEvent,
  PhotoRecord,
  RuntimePhoto,
} from "@/editor/domain/types";
import { createRuntimePhoto, processImageFile, revokePhotoUrls } from "@/editor/imaging/imagePipeline";
import {
  clearWorkspace,
  getStorageEstimate,
  loadWorkspace,
  requestPersistentStorage,
  saveEdit,
  saveHistoryCursor,
  saveImportedPhoto,
  saveSelection,
} from "@/editor/persistence/repository";
import { initialEditorState, selectedPhotoFromState, useEditorStore } from "@/editor/state/store";
import { adjustmentCommandSchema } from "@/validation/schemas";
import { createId } from "@/lib/id";

let hydrationPromise: Promise<void> | null = null;
let saveChain: Promise<void> = Promise.resolve();
let pendingWrites = 0;

function addNotice(message: string, tone: "info" | "success" | "error" = "info") {
  useEditorStore.setState((state) => ({
    notices: [...state.notices, { id: createId(), message, tone }].slice(-4),
  }));
}

function enqueuePersistence(task: () => Promise<void>): void {
  pendingWrites += 1;
  useEditorStore.setState({ saveStatus: "saving" });
  saveChain = saveChain
    .catch(() => undefined)
    .then(async () => {
      try {
        await task();
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 250));
        await task();
      }
    })
    .then(() => {
      pendingWrites -= 1;
      useEditorStore.setState({ saveStatus: pendingWrites === 0 ? "saved" : "saving" });
    })
    .catch((error: unknown) => {
      pendingWrites -= 1;
      useEditorStore.setState({ saveStatus: "error" });
      addNotice(
        error instanceof Error ? `Local save failed: ${error.message}` : "Local save failed.",
        "error",
      );
    });
}

function replacePhoto(photoId: string, update: (photo: RuntimePhoto) => RuntimePhoto): RuntimePhoto | null {
  let updated: RuntimePhoto | null = null;
  useEditorStore.setState((state) => ({
    photos: state.photos.map((photo) => {
      if (photo.id !== photoId) return photo;
      updated = update(photo);
      return updated;
    }),
  }));
  return updated;
}

function persistentPhoto(photo: RuntimePhoto): PhotoRecord {
  const record = { ...photo } as Partial<RuntimePhoto>;
  delete record.previewUrl;
  delete record.thumbnailUrl;
  return record as PhotoRecord;
}

async function refreshStorageEstimate(): Promise<void> {
  try {
    const estimate = await getStorageEstimate();
    useEditorStore.setState({
      storageUsage: estimate?.usage ?? null,
      storageQuota: estimate?.quota ?? null,
    });
  } catch {
    // Storage estimates are informative; the editor still works without them.
  }
}

async function hydrate(): Promise<void> {
  if (useEditorStore.getState().hydrated) return;
  hydrationPromise ??= (async () => {
    try {
      const snapshot = await loadWorkspace();
      const assetById = new Map(snapshot.assets.map((asset) => [asset.photoId, asset]));
      const photos: RuntimePhoto[] = [];
      for (const photo of snapshot.photos) {
        const asset = assetById.get(photo.id);
        if (asset) photos.push(createRuntimePhoto(photo, asset));
      }
      const historyByPhoto: Record<string, HistoryEvent[]> = {};
      for (const event of snapshot.historyEvents) {
        (historyByPhoto[event.photoId] ??= []).push(event);
      }
      for (const events of Object.values(historyByPhoto)) {
        events.sort((a, b) => a.sequence - b.sequence);
      }
      const storedSelection = snapshot.workspace?.selectedPhotoId;
      const selectedPhotoId = photos.some((photo) => photo.id === storedSelection)
        ? storedSelection ?? null
        : photos[0]?.id ?? null;
      useEditorStore.setState({
        hydrated: true,
        photos,
        selectedPhotoId,
        historyByPhoto,
        saveStatus: "saved",
      });
      await refreshStorageEstimate();
    } catch (error) {
      useEditorStore.setState({ hydrated: true, saveStatus: "error" });
      addNotice(
        error instanceof Error ? `Could not restore the local library: ${error.message}` : "Could not restore the local library.",
        "error",
      );
    }
  })();
  return hydrationPromise;
}

async function importFiles(files: File[]): Promise<void> {
  const supported = files.filter((file) => file.type === "image/jpeg" || file.type === "image/png");
  const skipped = files.length - supported.length;
  if (skipped > 0) addNotice(`${skipped} unsupported file${skipped === 1 ? " was" : "s were"} skipped.`, "error");
  if (supported.length === 0) return;

  const initialLength = useEditorStore.getState().photos.length;
  useEditorStore.setState({
    isImporting: true,
    importCompleted: 0,
    importTotal: supported.length,
  });

  let imported = 0;
  for (let index = 0; index < supported.length; index += 1) {
    const file = supported[index];
    try {
      const processed = await processImageFile(file, initialLength + imported);
      const current = useEditorStore.getState();
      const selection = current.selectedPhotoId ?? processed.photo.id;
      await saveImportedPhoto(processed.photo, processed.assets, selection);
      const runtimePhoto = createRuntimePhoto(processed.photo, processed.assets);
      useEditorStore.setState((state) => ({
        photos: [...state.photos, runtimePhoto],
        selectedPhotoId: state.selectedPhotoId ?? runtimePhoto.id,
        historyByPhoto: { ...state.historyByPhoto, [runtimePhoto.id]: [] },
        saveStatus: "saved",
        importCompleted: index + 1,
      }));
      imported += 1;
    } catch (error) {
      addNotice(error instanceof Error ? error.message : `${file.name} could not be imported.`, "error");
      useEditorStore.setState({ importCompleted: index + 1 });
    }
  }

  useEditorStore.setState({ isImporting: false });
  if (imported > 0) {
    addNotice(`${imported} photo${imported === 1 ? "" : "s"} added to your local library.`, "success");
    try {
      const persistentStorage = await requestPersistentStorage();
      useEditorStore.setState({ persistentStorage });
    } catch {
      useEditorStore.setState({ persistentStorage: false });
    }
    await refreshStorageEstimate();
  }
}

function previewAdjustment(photoId: string, key: AdjustmentKey, value: number): void {
  const nextValue = clampAdjustment(key, value);
  const state = useEditorStore.getState();
  const photo = state.photos.find((item) => item.id === photoId);
  if (!photo) return;
  const draft = state.draft?.photoId === photoId && state.draft.key === key
    ? state.draft
    : { photoId, key, baselineValue: photo.editState.adjustments[key] };
  useEditorStore.setState({ draft });
  replacePhoto(photoId, (current) => ({
    ...current,
    editState: {
      adjustments: { ...current.editState.adjustments, [key]: nextValue },
    },
  }));
}

function commitAdjustment(
  photoId: string,
  key: AdjustmentKey,
  value: number,
  actor: Actor = "user",
): void {
  const parsed = adjustmentCommandSchema.parse({ photoId, key, value, actor });
  const state = useEditorStore.getState();
  const photo = state.photos.find((item) => item.id === photoId);
  if (!photo) return;
  const baselineValue = state.draft?.photoId === photoId && state.draft.key === key
    ? state.draft.baselineValue
    : photo.editState.adjustments[key];
  const nextValue = clampAdjustment(key, parsed.value);
  if (baselineValue === nextValue) {
    replacePhoto(photoId, (current) => ({
      ...current,
      editState: { adjustments: { ...current.editState.adjustments, [key]: baselineValue } },
    }));
    useEditorStore.setState({ draft: null });
    return;
  }

  const beforeAdjustments = { ...photo.editState.adjustments, [key]: baselineValue };
  const afterAdjustments = { ...photo.editState.adjustments, [key]: nextValue };
  const allEvents = state.historyByPhoto[photoId] ?? [];
  const appliedCount = photo.historyCursor;
  const event: HistoryEvent = {
    id: createId(),
    photoId,
    sequence: appliedCount + 1,
    actor: parsed.actor,
    timestamp: Date.now(),
    type: "adjustment.changed",
    before: cloneEditState(beforeAdjustments),
    after: cloneEditState(afterAdjustments),
    payload: { property: key, previousValue: baselineValue, nextValue },
  };
  const nextEvents = [...allEvents.slice(0, appliedCount), event];
  const updatedPhoto = replacePhoto(photoId, (current) => ({
    ...current,
    updatedAt: event.timestamp,
    editState: event.after,
    historyCursor: nextEvents.length,
  }));
  useEditorStore.setState((current) => ({
    draft: null,
    historyByPhoto: { ...current.historyByPhoto, [photoId]: nextEvents },
  }));
  if (updatedPhoto) {
    const removeFrom = allEvents.length > appliedCount ? appliedCount + 1 : null;
    enqueuePersistence(() => saveEdit(persistentPhoto(updatedPhoto), event, removeFrom));
  }
}

function cancelAdjustment(): void {
  const draft = useEditorStore.getState().draft;
  if (!draft) return;
  replacePhoto(draft.photoId, (photo) => ({
    ...photo,
    editState: {
      adjustments: { ...photo.editState.adjustments, [draft.key]: draft.baselineValue },
    },
  }));
  useEditorStore.setState({ draft: null });
}

function resetAll(photoId: string): void {
  cancelAdjustment();
  const state = useEditorStore.getState();
  const photo = state.photos.find((item) => item.id === photoId);
  if (!photo) return;
  const defaults = createDefaultAdjustments();
  if (Object.keys(defaults).every((key) => photo.editState.adjustments[key as AdjustmentKey] === 0)) return;
  const events = state.historyByPhoto[photoId] ?? [];
  const event: HistoryEvent = {
    id: createId(),
    photoId,
    sequence: photo.historyCursor + 1,
    actor: "user",
    timestamp: Date.now(),
    type: "adjustments.reset",
    before: cloneEditState(photo.editState.adjustments),
    after: cloneEditState(defaults),
    payload: { label: "Reset all adjustments" },
  };
  const nextEvents = [...events.slice(0, photo.historyCursor), event];
  const updatedPhoto = replacePhoto(photoId, (current) => ({
    ...current,
    updatedAt: event.timestamp,
    editState: event.after,
    historyCursor: nextEvents.length,
  }));
  useEditorStore.setState((current) => ({
    historyByPhoto: { ...current.historyByPhoto, [photoId]: nextEvents },
  }));
  if (updatedPhoto) {
    const removeFrom = events.length > photo.historyCursor ? photo.historyCursor + 1 : null;
    enqueuePersistence(() => saveEdit(persistentPhoto(updatedPhoto), event, removeFrom));
  }
}

function undo(photoId: string): void {
  cancelAdjustment();
  const state = useEditorStore.getState();
  const photo = state.photos.find((item) => item.id === photoId);
  const events = state.historyByPhoto[photoId] ?? [];
  if (!photo || photo.historyCursor <= 0) return;
  const event = events[photo.historyCursor - 1];
  const updated = replacePhoto(photoId, (current) => ({
    ...current,
    updatedAt: Date.now(),
    editState: cloneEditState(event.before.adjustments),
    historyCursor: current.historyCursor - 1,
  }));
  if (updated) enqueuePersistence(() => saveHistoryCursor(persistentPhoto(updated)));
}

function redo(photoId: string): void {
  cancelAdjustment();
  const state = useEditorStore.getState();
  const photo = state.photos.find((item) => item.id === photoId);
  const events = state.historyByPhoto[photoId] ?? [];
  if (!photo || photo.historyCursor >= events.length) return;
  const event = events[photo.historyCursor];
  const updated = replacePhoto(photoId, (current) => ({
    ...current,
    updatedAt: Date.now(),
    editState: cloneEditState(event.after.adjustments),
    historyCursor: current.historyCursor + 1,
  }));
  if (updated) enqueuePersistence(() => saveHistoryCursor(persistentPhoto(updated)));
}

function selectPhoto(photoId: string): void {
  cancelAdjustment();
  if (!useEditorStore.getState().photos.some((photo) => photo.id === photoId)) return;
  useEditorStore.setState({ selectedPhotoId: photoId, showOriginal: false });
  enqueuePersistence(() => saveSelection(photoId));
}

function navigatePhoto(direction: -1 | 1): void {
  const state = useEditorStore.getState();
  if (state.photos.length === 0) return;
  const index = state.photos.findIndex((photo) => photo.id === state.selectedPhotoId);
  const nextIndex = Math.min(state.photos.length - 1, Math.max(0, index + direction));
  const next = state.photos[nextIndex];
  if (next && next.id !== state.selectedPhotoId) selectPhoto(next.id);
}

async function newLibrary(): Promise<void> {
  const photos = useEditorStore.getState().photos;
  await saveChain.catch(() => undefined);
  await clearWorkspace();
  photos.forEach(revokePhotoUrls);
  useEditorStore.setState({ ...initialEditorState, hydrated: true, saveStatus: "saved" });
  hydrationPromise = Promise.resolve();
  await refreshStorageEstimate();
  addNotice("A fresh local library is ready.", "success");
}

function dismissNotice(id: string): void {
  useEditorStore.setState((state) => ({ notices: state.notices.filter((notice) => notice.id !== id) }));
}

function setShowOriginal(showOriginal: boolean): void {
  useEditorStore.setState({ showOriginal });
}

function getSelectedPhoto(): RuntimePhoto | null {
  return selectedPhotoFromState(useEditorStore.getState());
}

export const editorService = {
  hydrate,
  importFiles,
  previewAdjustment,
  commitAdjustment,
  cancelAdjustment,
  resetAll,
  undo,
  redo,
  selectPhoto,
  navigatePhoto,
  newLibrary,
  dismissNotice,
  setShowOriginal,
  refreshStorageEstimate,
  getSelectedPhoto,
  addNotice,
};
