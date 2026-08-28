import { beforeEach, describe, expect, it } from "vitest";

import { createDefaultAdjustments, createDefaultEditState } from "@/editor/domain/adjustments";
import type { HistoryEvent, PhotoAssetRecord, PhotoRecord } from "@/editor/domain/types";
import { resetDatabaseForTests } from "@/editor/persistence/db";
import { loadWorkspace, saveEdit, saveImportedPhoto } from "@/editor/persistence/repository";

describe("local workspace persistence", () => {
  beforeEach(async () => {
    await resetDatabaseForTests();
  });

  it("restores original assets and current edit history", async () => {
    const photo: PhotoRecord = {
      id: "photo-a",
      order: 0,
      name: "test.png",
      mimeType: "image/png",
      size: 3,
      width: 1,
      height: 1,
      createdAt: 1,
      updatedAt: 1,
      editState: createDefaultEditState(),
      historyCursor: 0,
    };
    const assets: PhotoAssetRecord = {
      photoId: photo.id,
      original: new Blob(["abc"], { type: "image/png" }),
      preview: new Blob(["preview"], { type: "image/png" }),
      thumbnail: new Blob(["thumb"], { type: "image/png" }),
    };
    await saveImportedPhoto(photo, assets, photo.id);

    const after = { ...createDefaultAdjustments(), exposure: 1.2 };
    const afterState = createDefaultEditState();
    afterState.adjustments = after;
    const event: HistoryEvent = {
      id: "event-a",
      photoId: photo.id,
      sequence: 1,
      actor: "user",
      timestamp: 2,
      type: "adjustment.changed",
      before: createDefaultEditState(),
      after: afterState,
      payload: { property: "exposure", previousValue: 0, nextValue: 1.2 },
    };
    await saveEdit({ ...photo, editState: event.after, historyCursor: 1 }, event, null);

    const restored = await loadWorkspace();
    expect(restored.workspace?.selectedPhotoId).toBe(photo.id);
    expect(restored.photos[0].editState.adjustments.exposure).toBe(1.2);
    expect(restored.assets[0].photoId).toBe(photo.id);
    expect(restored.historyEvents).toEqual([event]);
  });

  it("persists gradient geometry and local adjustments", async () => {
    const photo: PhotoRecord = {
      id: "photo-mask",
      order: 0,
      name: "mask.png",
      mimeType: "image/png",
      size: 3,
      width: 100,
      height: 100,
      createdAt: 1,
      updatedAt: 2,
      editState: createDefaultEditState(),
      historyCursor: 0,
    };
    const assets: PhotoAssetRecord = {
      photoId: photo.id,
      original: new Blob(["abc"], { type: "image/png" }),
      preview: new Blob(["preview"], { type: "image/png" }),
      thumbnail: new Blob(["thumb"], { type: "image/png" }),
    };
    await saveImportedPhoto(photo, assets, photo.id);
    const maskState = createDefaultEditState();
    maskState.masks.push({
      id: "gradient-1",
      type: "linear-gradient",
      name: "Linear Gradient 1",
      startX: 0.5,
      startY: 0.05,
      endX: 0.5,
      endY: 0.4,
      feather: 0.65,
      adjustments: { ...createDefaultAdjustments(), exposure: -0.7 },
    });
    const event: HistoryEvent = {
      id: "mask-event",
      photoId: photo.id,
      sequence: 1,
      actor: "user",
      timestamp: 3,
      type: "mask.created",
      before: createDefaultEditState(),
      after: maskState,
      payload: { maskId: "gradient-1", maskName: "Linear Gradient 1" },
    };
    await saveEdit({ ...photo, editState: maskState, historyCursor: 1 }, event, null);
    const restored = await loadWorkspace();
    expect(restored.photos[0].editState.masks[0]).toMatchObject({
      id: "gradient-1",
      startY: 0.05,
      endY: 0.4,
      adjustments: { exposure: -0.7 },
    });
  });

  it("persists curve, color, effects, and detail settings together", async () => {
    const state = createDefaultEditState();
    state.toneCurve.rgb = [{ x: 0, y: 0 }, { x: 0.3, y: 0.2 }, { x: 0.62, y: 0.72 }, { x: 1, y: 1 }];
    state.colorMix.orange.luminance = 18;
    state.colorGrading.highlights = { hue: 42, saturation: 24, luminance: 5 };
    state.effects.grain = 30;
    state.detail.colorNoise = 35;
    const photo: PhotoRecord = {
      id: "develop-photo",
      order: 0,
      name: "develop.png",
      mimeType: "image/png",
      size: 3,
      width: 10,
      height: 10,
      createdAt: 1,
      updatedAt: 1,
      editState: state,
      historyCursor: 0,
    };
    await saveImportedPhoto(photo, {
      photoId: photo.id,
      original: new Blob(["a"]),
      preview: new Blob(["b"]),
      thumbnail: new Blob(["c"]),
    }, photo.id);
    const restored = await loadWorkspace();
    expect(restored.photos[0].editState).toMatchObject({
      toneCurve: { rgb: [{ x: 0, y: 0 }, { x: 0.3, y: 0.2 }, { x: 0.62, y: 0.72 }, { x: 1, y: 1 }] },
      colorMix: { orange: { luminance: 18 } },
      colorGrading: { highlights: { hue: 42, saturation: 24, luminance: 5 } },
      effects: { grain: 30 },
      detail: { colorNoise: 35 },
    });
  });
});
