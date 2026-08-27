import { beforeEach, describe, expect, it } from "vitest";

import { createDefaultAdjustments } from "@/editor/domain/adjustments";
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
      editState: { adjustments: createDefaultAdjustments() },
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
    const event: HistoryEvent = {
      id: "event-a",
      photoId: photo.id,
      sequence: 1,
      actor: "user",
      timestamp: 2,
      type: "adjustment.changed",
      before: { adjustments: createDefaultAdjustments() },
      after: { adjustments: after },
      payload: { property: "exposure", previousValue: 0, nextValue: 1.2 },
    };
    await saveEdit({ ...photo, editState: event.after, historyCursor: 1 }, event, null);

    const restored = await loadWorkspace();
    expect(restored.workspace?.selectedPhotoId).toBe(photo.id);
    expect(restored.photos[0].editState.adjustments.exposure).toBe(1.2);
    expect(restored.assets[0].photoId).toBe(photo.id);
    expect(restored.historyEvents).toEqual([event]);
  });
});
