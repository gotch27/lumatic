import {
  clampAdjustment,
  clampGradientGeometry,
  cloneEditState,
  cloneMask,
  createDefaultAdjustments,
} from "@/editor/domain/adjustments";
import {
  createLinearGradientMask,
  getGradientGeometry,
  MAX_LINEAR_GRADIENTS,
  sameGradientGeometry,
  type LinearGradientGeometry,
} from "@/editor/domain/masks";
import {
  COLOR_MIX_PROPERTIES,
  DETAIL_DEFINITIONS,
  EFFECT_DEFINITIONS,
  clampDevelopValue,
  createDefaultColorGrading,
  createDefaultColorMix,
  createDefaultDetail,
  createDefaultEffects,
  createDefaultToneCurve,
  normalizeCurvePoints,
} from "@/editor/domain/developSettings";
import type {
  Actor,
  AdjustmentKey,
  ColorGradeRange,
  ColorMixChannel,
  CurveChannel,
  CurvePoint,
  DetailValues,
  EffectValues,
  HistoryEvent,
  HistoryEventType,
  LinearGradientMask,
  PhotoEditState,
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
import { createId } from "@/lib/id";
import {
  adjustmentCommandSchema,
  developSettingCommandSchema,
  linearGradientGeometrySchema,
  maskAdjustmentCommandSchema,
  toneCurveCommandSchema,
} from "@/validation/schemas";

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

function findMask(photo: RuntimePhoto, maskId: string): LinearGradientMask | null {
  return photo.editState.masks.find((mask) => mask.id === maskId) ?? null;
}

function replaceMask(
  editState: PhotoEditState,
  maskId: string,
  update: (mask: LinearGradientMask) => LinearGradientMask,
): PhotoEditState {
  const next = cloneEditState(editState);
  next.masks = editState.masks.map((mask) => (mask.id === maskId ? update(cloneMask(mask)) : cloneMask(mask)));
  return next;
}

function commitEvent(
  photoId: string,
  before: PhotoEditState,
  after: PhotoEditState,
  type: HistoryEventType,
  payload: HistoryEvent["payload"],
  actor: Actor,
): void {
  const state = useEditorStore.getState();
  const photo = state.photos.find((item) => item.id === photoId);
  if (!photo) return;
  const events = state.historyByPhoto[photoId] ?? [];
  const appliedCount = photo.historyCursor;
  const event: HistoryEvent = {
    id: createId(),
    photoId,
    sequence: appliedCount + 1,
    actor,
    timestamp: Date.now(),
    type,
    before: cloneEditState(before),
    after: cloneEditState(after),
    payload,
  };
  const nextEvents = [...events.slice(0, appliedCount), event];
  const updatedPhoto = replacePhoto(photoId, (current) => ({
    ...current,
    updatedAt: event.timestamp,
    editState: cloneEditState(after),
    historyCursor: nextEvents.length,
  }));
  useEditorStore.setState((current) => ({
    draft: null,
    historyByPhoto: { ...current.historyByPhoto, [photoId]: nextEvents },
  }));
  if (updatedPhoto) {
    const removeFrom = events.length > appliedCount ? appliedCount + 1 : null;
    enqueuePersistence(() => saveEdit(persistentPhoto(updatedPhoto), event, removeFrom));
  }
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
      for (const events of Object.values(historyByPhoto)) events.sort((a, b) => a.sequence - b.sequence);
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
  useEditorStore.setState({ isImporting: true, importCompleted: 0, importTotal: supported.length });
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
      useEditorStore.setState({ persistentStorage: await requestPersistentStorage() });
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
  const draft = state.draft?.kind === "global-adjustment"
    && state.draft.photoId === photoId
    && state.draft.key === key
    ? state.draft
    : { kind: "global-adjustment" as const, photoId, key, baselineValue: photo.editState.adjustments[key] };
  useEditorStore.setState({ draft });
  replacePhoto(photoId, (current) => ({
    ...current,
    editState: {
      ...cloneEditState(current.editState),
      adjustments: { ...current.editState.adjustments, [key]: nextValue },
    },
  }));
}

function commitAdjustment(photoId: string, key: AdjustmentKey, value: number, actor: Actor = "user"): void {
  const parsed = adjustmentCommandSchema.parse({ photoId, key, value, actor });
  const state = useEditorStore.getState();
  const photo = state.photos.find((item) => item.id === photoId);
  if (!photo) return;
  const baselineValue = state.draft?.kind === "global-adjustment"
    && state.draft.photoId === photoId
    && state.draft.key === key
    ? state.draft.baselineValue
    : photo.editState.adjustments[key];
  const nextValue = clampAdjustment(key, parsed.value);
  const before = cloneEditState(photo.editState);
  before.adjustments[key] = baselineValue;
  const after = cloneEditState(photo.editState);
  after.adjustments[key] = nextValue;
  if (baselineValue === nextValue) {
    replacePhoto(photoId, (current) => ({ ...current, editState: before }));
    useEditorStore.setState({ draft: null });
    return;
  }
  commitEvent(photoId, before, after, "adjustment.changed", {
    property: key,
    previousValue: baselineValue,
    nextValue,
  }, parsed.actor);
}

function previewDevelopState(
  photoId: string,
  target: string,
  mutate: (editState: PhotoEditState) => void,
): void {
  let state = useEditorStore.getState();
  if (state.draft && !(state.draft.kind === "develop-setting"
    && state.draft.photoId === photoId
    && state.draft.target === target)) {
    cancelAdjustment();
    state = useEditorStore.getState();
  }
  const photo = state.photos.find((item) => item.id === photoId);
  if (!photo) return;
  const draft = state.draft?.kind === "develop-setting"
    && state.draft.photoId === photoId
    && state.draft.target === target
    ? state.draft
    : { kind: "develop-setting" as const, photoId, target, baseline: cloneEditState(photo.editState) };
  useEditorStore.setState({ draft });
  replacePhoto(photoId, (current) => {
    const editState = cloneEditState(current.editState);
    mutate(editState);
    return { ...current, editState };
  });
}

function commitDevelopState(
  photoId: string,
  target: string,
  type: HistoryEventType,
  payload: HistoryEvent["payload"],
  actor: Actor,
): void {
  const state = useEditorStore.getState();
  const photo = state.photos.find((item) => item.id === photoId);
  if (!photo) return;
  const before = state.draft?.kind === "develop-setting"
    && state.draft.photoId === photoId
    && state.draft.target === target
    ? state.draft.baseline
    : cloneEditState(photo.editState);
  const after = cloneEditState(photo.editState);
  if (JSON.stringify(before) === JSON.stringify(after)) {
    useEditorStore.setState({ draft: null });
    return;
  }
  commitEvent(photoId, before, after, type, payload, actor);
}

function previewToneCurve(photoId: string, channel: CurveChannel, points: readonly CurvePoint[]): void {
  const parsed = toneCurveCommandSchema.parse({ photoId, channel, points: normalizeCurvePoints(points), actor: "user" });
  const target = `curve.${channel}`;
  previewDevelopState(photoId, target, (editState) => {
    editState.toneCurve[channel] = normalizeCurvePoints(parsed.points);
  });
}

function commitToneCurve(
  photoId: string,
  channel: CurveChannel,
  points: readonly CurvePoint[],
  actor: Actor = "user",
): void {
  const parsed = toneCurveCommandSchema.parse({ photoId, channel, points: normalizeCurvePoints(points), actor });
  const target = `curve.${channel}`;
  previewToneCurve(photoId, channel, parsed.points);
  commitDevelopState(photoId, target, "curve.changed", {
    property: channel,
    label: `${channel === "rgb" ? "RGB" : channel[0].toUpperCase() + channel.slice(1)} curve`,
  }, parsed.actor);
}

function previewColorMix(
  photoId: string,
  channel: ColorMixChannel,
  property: "hue" | "saturation" | "luminance",
  value: number,
): void {
  const definition = COLOR_MIX_PROPERTIES.find((item) => item.key === property)!;
  const nextValue = clampDevelopValue(definition, value);
  const target = `colorMix.${channel}.${property}`;
  developSettingCommandSchema.parse({ photoId, target, value: nextValue, actor: "user" });
  previewDevelopState(photoId, target, (editState) => {
    editState.colorMix[channel][property] = nextValue;
  });
}

function commitColorMix(
  photoId: string,
  channel: ColorMixChannel,
  property: "hue" | "saturation" | "luminance",
  value: number,
  actor: Actor = "user",
): void {
  const target = `colorMix.${channel}.${property}`;
  const parsed = developSettingCommandSchema.parse({ photoId, target, value, actor });
  previewColorMix(photoId, channel, property, parsed.value);
  commitDevelopState(photoId, target, "colorMix.changed", {
    property: target,
    nextValue: parsed.value,
    label: `${channel[0].toUpperCase() + channel.slice(1)} ${property}`,
  }, parsed.actor);
}

type GradeProperty = "hue" | "saturation" | "luminance";

function previewColorGrade(
  photoId: string,
  range: ColorGradeRange,
  property: GradeProperty,
  value: number,
): void {
  const min = property === "hue" ? 0 : property === "saturation" ? 0 : -100;
  const max = property === "hue" ? 360 : 100;
  const nextValue = Number(Math.min(max, Math.max(min, value)).toFixed(0));
  const target = `colorGrading.${range}.${property}`;
  developSettingCommandSchema.parse({ photoId, target, value: nextValue, actor: "user" });
  previewDevelopState(photoId, target, (editState) => {
    editState.colorGrading[range][property] = nextValue;
  });
}

function commitColorGrade(
  photoId: string,
  range: ColorGradeRange,
  property: GradeProperty,
  value: number,
  actor: Actor = "user",
): void {
  const target = `colorGrading.${range}.${property}`;
  const parsed = developSettingCommandSchema.parse({ photoId, target, value, actor });
  previewColorGrade(photoId, range, property, parsed.value);
  commitDevelopState(photoId, target, "colorGrading.changed", {
    property: target,
    nextValue: parsed.value,
    label: `${range[0].toUpperCase() + range.slice(1)} ${property}`,
  }, parsed.actor);
}

function previewColorGradeWheel(photoId: string, range: ColorGradeRange, hue: number, saturation: number): void {
  const nextHue = Number(Math.min(360, Math.max(0, hue)).toFixed(0));
  const nextSaturation = Number(Math.min(100, Math.max(0, saturation)).toFixed(0));
  const target = `colorGrading.${range}.wheel`;
  previewDevelopState(photoId, target, (editState) => {
    editState.colorGrading[range].hue = nextHue;
    editState.colorGrading[range].saturation = nextSaturation;
  });
}

function commitColorGradeWheel(
  photoId: string,
  range: ColorGradeRange,
  hue: number,
  saturation: number,
  actor: Actor = "user",
): void {
  const target = `colorGrading.${range}.wheel`;
  previewColorGradeWheel(photoId, range, hue, saturation);
  commitDevelopState(photoId, target, "colorGrading.changed", {
    property: target,
    label: `${range[0].toUpperCase() + range.slice(1)} color wheel`,
  }, actor);
}

function previewColorGradeMaster(photoId: string, property: "blending" | "balance", value: number): void {
  const min = property === "blending" ? 0 : -100;
  const nextValue = Number(Math.min(100, Math.max(min, value)).toFixed(0));
  const target = `colorGrading.${property}`;
  previewDevelopState(photoId, target, (editState) => {
    editState.colorGrading[property] = nextValue;
  });
}

function commitColorGradeMaster(
  photoId: string,
  property: "blending" | "balance",
  value: number,
  actor: Actor = "user",
): void {
  const target = `colorGrading.${property}`;
  const parsed = developSettingCommandSchema.parse({ photoId, target, value, actor });
  previewColorGradeMaster(photoId, property, parsed.value);
  commitDevelopState(photoId, target, "colorGrading.changed", {
    property: target,
    nextValue: parsed.value,
    label: `Color grading ${property}`,
  }, parsed.actor);
}

function previewEffect(photoId: string, key: keyof EffectValues, value: number): void {
  const definition = EFFECT_DEFINITIONS.find((item) => item.key === key)!;
  const nextValue = clampDevelopValue(definition, value);
  const target = `effects.${key}`;
  previewDevelopState(photoId, target, (editState) => {
    editState.effects[key] = nextValue;
  });
}

function commitEffect(photoId: string, key: keyof EffectValues, value: number, actor: Actor = "user"): void {
  const definition = EFFECT_DEFINITIONS.find((item) => item.key === key)!;
  const nextValue = clampDevelopValue(definition, value);
  const target = `effects.${key}`;
  const parsed = developSettingCommandSchema.parse({ photoId, target, value: nextValue, actor });
  previewEffect(photoId, key, parsed.value);
  commitDevelopState(photoId, target, "effect.changed", {
    property: key,
    nextValue,
    label: definition.label,
  }, parsed.actor);
}

function previewDetail(photoId: string, key: keyof DetailValues, value: number): void {
  const definition = DETAIL_DEFINITIONS.find((item) => item.key === key)!;
  const nextValue = clampDevelopValue(definition, value);
  const target = `detail.${key}`;
  previewDevelopState(photoId, target, (editState) => {
    editState.detail[key] = nextValue;
  });
}

function commitDetail(photoId: string, key: keyof DetailValues, value: number, actor: Actor = "user"): void {
  const definition = DETAIL_DEFINITIONS.find((item) => item.key === key)!;
  const nextValue = clampDevelopValue(definition, value);
  const target = `detail.${key}`;
  const parsed = developSettingCommandSchema.parse({ photoId, target, value: nextValue, actor });
  previewDetail(photoId, key, parsed.value);
  commitDevelopState(photoId, target, "detail.changed", {
    property: key,
    nextValue,
    label: definition.label,
  }, parsed.actor);
}

type DevelopGroup = "toneCurve" | "colorMix" | "colorGrading" | "effects" | "detail";

function resetDevelopGroup(photoId: string, group: DevelopGroup): void {
  cancelAdjustment();
  const photo = useEditorStore.getState().photos.find((item) => item.id === photoId);
  if (!photo) return;
  const before = cloneEditState(photo.editState);
  const after = cloneEditState(photo.editState);
  const defaults = {
    toneCurve: createDefaultToneCurve,
    colorMix: createDefaultColorMix,
    colorGrading: createDefaultColorGrading,
    effects: createDefaultEffects,
    detail: createDefaultDetail,
  }[group]();
  (after[group] as typeof defaults) = defaults;
  if (JSON.stringify(before[group]) === JSON.stringify(defaults)) return;
  const eventType: Record<DevelopGroup, HistoryEventType> = {
    toneCurve: "curve.changed",
    colorMix: "colorMix.changed",
    colorGrading: "colorGrading.changed",
    effects: "effect.changed",
    detail: "detail.changed",
  };
  commitEvent(photoId, before, after, eventType[group], { label: `Reset ${group}` }, "user");
}

function beginLinearGradient(photoId: string, startX: number, startY: number): string | null {
  cancelAdjustment();
  const photo = useEditorStore.getState().photos.find((item) => item.id === photoId);
  if (!photo) return null;
  if (photo.editState.masks.length >= MAX_LINEAR_GRADIENTS) {
    addNotice(`A photo can currently contain up to ${MAX_LINEAR_GRADIENTS} linear gradients.`, "error");
    return null;
  }
  const mask = createLinearGradientMask(createId(), photo.editState.masks.length + 1, startX, startY);
  replacePhoto(photoId, (current) => ({
    ...current,
    editState: {
      ...cloneEditState(current.editState),
      masks: [...current.editState.masks.map(cloneMask), mask],
    },
  }));
  useEditorStore.setState({
    draft: { kind: "mask-geometry", photoId, maskId: mask.id, baseline: null },
    selectedMaskId: mask.id,
  });
  return mask.id;
}

function previewLinearGradientGeometry(photoId: string, maskId: string, geometry: LinearGradientGeometry): void {
  const nextGeometry = clampGradientGeometry(geometry);
  linearGradientGeometrySchema.parse(nextGeometry);
  const state = useEditorStore.getState();
  const photo = state.photos.find((item) => item.id === photoId);
  if (!photo) return;
  const mask = findMask(photo, maskId);
  if (!mask) return;
  const draft = state.draft?.kind === "mask-geometry"
    && state.draft.photoId === photoId
    && state.draft.maskId === maskId
    ? state.draft
    : { kind: "mask-geometry" as const, photoId, maskId, baseline: cloneMask(mask) };
  useEditorStore.setState({ draft, selectedMaskId: maskId });
  replacePhoto(photoId, (current) => ({
    ...current,
    editState: replaceMask(current.editState, maskId, (currentMask) => ({ ...currentMask, ...nextGeometry })),
  }));
}

function commitLinearGradientGeometry(
  photoId: string,
  maskId: string,
  geometry: LinearGradientGeometry,
  actor: Actor = "user",
): void {
  previewLinearGradientGeometry(photoId, maskId, geometry);
  const state = useEditorStore.getState();
  const photo = state.photos.find((item) => item.id === photoId);
  const currentMask = photo ? findMask(photo, maskId) : null;
  if (!photo || !currentMask) return;
  const baseline = state.draft?.kind === "mask-geometry"
    && state.draft.photoId === photoId
    && state.draft.maskId === maskId
    ? state.draft.baseline
    : cloneMask(currentMask);
  const after = cloneEditState(photo.editState);
  if (!baseline) {
    const before = cloneEditState(photo.editState);
    before.masks = before.masks.filter((mask) => mask.id !== maskId);
    useEditorStore.setState({ maskToolMode: "idle" });
    commitEvent(photoId, before, after, "mask.created", {
      maskId,
      maskName: currentMask.name,
      label: `Created ${currentMask.name}`,
    }, actor);
    return;
  }
  if (sameGradientGeometry(getGradientGeometry(baseline), getGradientGeometry(currentMask))) {
    useEditorStore.setState({ draft: null, maskToolMode: "idle" });
    return;
  }
  const before = replaceMask(photo.editState, maskId, () => cloneMask(baseline));
  useEditorStore.setState({ maskToolMode: "idle" });
  commitEvent(photoId, before, after, "mask.geometry.changed", {
    maskId,
    maskName: currentMask.name,
    label: `Moved ${currentMask.name}`,
  }, actor);
}

function previewMaskAdjustment(photoId: string, maskId: string, key: AdjustmentKey, value: number): void {
  const nextValue = clampAdjustment(key, value);
  const state = useEditorStore.getState();
  const photo = state.photos.find((item) => item.id === photoId);
  const mask = photo ? findMask(photo, maskId) : null;
  if (!photo || !mask) return;
  const draft = state.draft?.kind === "mask-adjustment"
    && state.draft.photoId === photoId
    && state.draft.maskId === maskId
    && state.draft.key === key
    ? state.draft
    : { kind: "mask-adjustment" as const, photoId, maskId, key, baselineValue: mask.adjustments[key] };
  useEditorStore.setState({ draft, selectedMaskId: maskId });
  replacePhoto(photoId, (current) => ({
    ...current,
    editState: replaceMask(current.editState, maskId, (currentMask) => ({
      ...currentMask,
      adjustments: { ...currentMask.adjustments, [key]: nextValue },
    })),
  }));
}

function commitMaskAdjustment(
  photoId: string,
  maskId: string,
  key: AdjustmentKey,
  value: number,
  actor: Actor = "user",
): void {
  const parsed = maskAdjustmentCommandSchema.parse({ photoId, maskId, key, value, actor });
  const state = useEditorStore.getState();
  const photo = state.photos.find((item) => item.id === photoId);
  const mask = photo ? findMask(photo, maskId) : null;
  if (!photo || !mask) return;
  const baselineValue = state.draft?.kind === "mask-adjustment"
    && state.draft.photoId === photoId
    && state.draft.maskId === maskId
    && state.draft.key === key
    ? state.draft.baselineValue
    : mask.adjustments[key];
  const nextValue = clampAdjustment(key, parsed.value);
  const before = replaceMask(photo.editState, maskId, (currentMask) => ({
    ...currentMask,
    adjustments: { ...currentMask.adjustments, [key]: baselineValue },
  }));
  const after = replaceMask(photo.editState, maskId, (currentMask) => ({
    ...currentMask,
    adjustments: { ...currentMask.adjustments, [key]: nextValue },
  }));
  if (baselineValue === nextValue) {
    replacePhoto(photoId, (current) => ({ ...current, editState: before }));
    useEditorStore.setState({ draft: null });
    return;
  }
  commitEvent(photoId, before, after, "mask.adjustment.changed", {
    maskId,
    maskName: mask.name,
    property: key,
    previousValue: baselineValue,
    nextValue,
  }, parsed.actor);
}

function resetMaskAdjustments(photoId: string, maskId: string): void {
  cancelAdjustment();
  const photo = useEditorStore.getState().photos.find((item) => item.id === photoId);
  const mask = photo ? findMask(photo, maskId) : null;
  if (!photo || !mask) return;
  const defaults = createDefaultAdjustments();
  if (Object.keys(defaults).every((key) => mask.adjustments[key as AdjustmentKey] === 0)) return;
  const before = cloneEditState(photo.editState);
  const after = replaceMask(photo.editState, maskId, (currentMask) => ({ ...currentMask, adjustments: defaults }));
  commitEvent(photoId, before, after, "mask.adjustment.changed", {
    maskId,
    maskName: mask.name,
    label: `Reset ${mask.name}`,
  }, "user");
}

function deleteMask(photoId: string, maskId: string): void {
  cancelAdjustment();
  const photo = useEditorStore.getState().photos.find((item) => item.id === photoId);
  const mask = photo ? findMask(photo, maskId) : null;
  if (!photo || !mask) return;
  const before = cloneEditState(photo.editState);
  const after = cloneEditState(photo.editState);
  after.masks = after.masks.filter((item) => item.id !== maskId);
  useEditorStore.setState({ selectedMaskId: null, maskToolMode: "idle" });
  commitEvent(photoId, before, after, "mask.deleted", {
    maskId,
    maskName: mask.name,
    label: `Deleted ${mask.name}`,
  }, "user");
}

function cancelAdjustment(): void {
  const draft = useEditorStore.getState().draft;
  if (!draft) return;
  if (draft.kind === "global-adjustment") {
    replacePhoto(draft.photoId, (photo) => ({
      ...photo,
      editState: {
        ...cloneEditState(photo.editState),
        adjustments: { ...photo.editState.adjustments, [draft.key]: draft.baselineValue },
      },
    }));
  } else if (draft.kind === "mask-adjustment") {
    replacePhoto(draft.photoId, (photo) => ({
      ...photo,
      editState: replaceMask(photo.editState, draft.maskId, (mask) => ({
        ...mask,
        adjustments: { ...mask.adjustments, [draft.key]: draft.baselineValue },
      })),
    }));
  } else if (draft.kind === "mask-geometry") {
    replacePhoto(draft.photoId, (photo) => ({
      ...photo,
      editState: draft.baseline
        ? replaceMask(photo.editState, draft.maskId, () => cloneMask(draft.baseline as LinearGradientMask))
        : {
            ...cloneEditState(photo.editState),
            masks: photo.editState.masks.filter((mask) => mask.id !== draft.maskId),
          },
    }));
  } else {
    replacePhoto(draft.photoId, (photo) => ({ ...photo, editState: cloneEditState(draft.baseline) }));
  }
  useEditorStore.setState({ draft: null, maskToolMode: "idle" });
}

function resetAll(photoId: string): void {
  cancelAdjustment();
  const photo = useEditorStore.getState().photos.find((item) => item.id === photoId);
  if (!photo) return;
  const defaults = createDefaultAdjustments();
  if (Object.keys(defaults).every((key) => photo.editState.adjustments[key as AdjustmentKey] === 0)) return;
  const before = cloneEditState(photo.editState);
  const after = cloneEditState(photo.editState);
  after.adjustments = defaults;
  commitEvent(photoId, before, after, "adjustments.reset", { label: "Reset all adjustments" }, "user");
}

function undo(photoId: string): void {
  cancelAdjustment();
  const state = useEditorStore.getState();
  const photo = state.photos.find((item) => item.id === photoId);
  const events = state.historyByPhoto[photoId] ?? [];
  if (!photo || photo.historyCursor <= 0) return;
  const event = events[photo.historyCursor - 1];
  const nextState = cloneEditState(event.before);
  const updated = replacePhoto(photoId, (current) => ({
    ...current,
    updatedAt: Date.now(),
    editState: nextState,
    historyCursor: current.historyCursor - 1,
  }));
  if (!nextState.masks.some((mask) => mask.id === state.selectedMaskId)) {
    useEditorStore.setState({ selectedMaskId: null, maskToolMode: "idle" });
  }
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
    editState: cloneEditState(event.after),
    historyCursor: current.historyCursor + 1,
  }));
  if (updated) enqueuePersistence(() => saveHistoryCursor(persistentPhoto(updated)));
}

function selectPhoto(photoId: string): void {
  cancelAdjustment();
  if (!useEditorStore.getState().photos.some((photo) => photo.id === photoId)) return;
  useEditorStore.setState({
    selectedPhotoId: photoId,
    selectedMaskId: null,
    maskToolMode: "idle",
    showOriginal: false,
  });
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

function setMaskToolMode(maskToolMode: "idle" | "create-linear"): void {
  cancelAdjustment();
  useEditorStore.setState({ maskToolMode });
}

function selectMask(maskId: string | null): void {
  cancelAdjustment();
  useEditorStore.setState({ selectedMaskId: maskId, maskToolMode: "idle" });
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
  previewToneCurve,
  commitToneCurve,
  previewColorMix,
  commitColorMix,
  previewColorGrade,
  commitColorGrade,
  previewColorGradeWheel,
  commitColorGradeWheel,
  previewColorGradeMaster,
  commitColorGradeMaster,
  previewEffect,
  commitEffect,
  previewDetail,
  commitDetail,
  resetDevelopGroup,
  beginLinearGradient,
  previewLinearGradientGeometry,
  commitLinearGradientGeometry,
  previewMaskAdjustment,
  commitMaskAdjustment,
  resetMaskAdjustments,
  deleteMask,
  cancelAdjustment,
  resetAll,
  undo,
  redo,
  selectPhoto,
  navigatePhoto,
  newLibrary,
  setMaskToolMode,
  selectMask,
  dismissNotice,
  setShowOriginal,
  refreshStorageEstimate,
  getSelectedPhoto,
  addNotice,
};
