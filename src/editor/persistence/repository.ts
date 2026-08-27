import Dexie from "dexie";

import type {
  HistoryEvent,
  PhotoAssetRecord,
  PhotoRecord,
  WorkspaceRecord,
} from "@/editor/domain/types";

import { getDatabase } from "./db";

export interface WorkspaceSnapshot {
  workspace: WorkspaceRecord | null;
  photos: PhotoRecord[];
  assets: PhotoAssetRecord[];
  historyEvents: HistoryEvent[];
}

export async function loadWorkspace(): Promise<WorkspaceSnapshot> {
  const db = getDatabase();
  const [workspace, photos, assets, historyEvents] = await Promise.all([
    db.workspace.get("current"),
    db.photos.orderBy("order").toArray(),
    db.assets.toArray(),
    db.historyEvents.orderBy("timestamp").toArray(),
  ]);

  return {
    workspace: workspace ?? null,
    photos,
    assets,
    historyEvents,
  };
}

export async function saveImportedPhoto(
  photo: PhotoRecord,
  assets: PhotoAssetRecord,
  selectedPhotoId: string,
): Promise<void> {
  const db = getDatabase();
  await db.transaction("rw", db.workspace, db.photos, db.assets, async () => {
    await db.photos.put(photo);
    await db.assets.put(assets);
    await db.workspace.put({
      id: "current",
      selectedPhotoId,
      updatedAt: Date.now(),
    });
  });
}

export async function saveSelection(selectedPhotoId: string | null): Promise<void> {
  const db = getDatabase();
  await db.workspace.put({ id: "current", selectedPhotoId, updatedAt: Date.now() });
}

export async function saveEdit(
  photo: PhotoRecord,
  event: HistoryEvent,
  removeAfterSequence: number | null,
): Promise<void> {
  const db = getDatabase();
  await db.transaction("rw", db.photos, db.historyEvents, async () => {
    if (removeAfterSequence !== null) {
      await db.historyEvents
        .where("[photoId+sequence]")
        .between(
          [photo.id, removeAfterSequence],
          [photo.id, Dexie.maxKey],
          true,
          true,
        )
        .delete();
    }
    await db.photos.put(photo);
    await db.historyEvents.put(event);
  });
}

export async function saveHistoryCursor(photo: PhotoRecord): Promise<void> {
  await getDatabase().photos.put(photo);
}

export async function clearWorkspace(): Promise<void> {
  const db = getDatabase();
  await db.transaction(
    "rw",
    db.workspace,
    db.photos,
    db.assets,
    db.historyEvents,
    async () => {
      await Promise.all([
        db.workspace.clear(),
        db.photos.clear(),
        db.assets.clear(),
        db.historyEvents.clear(),
      ]);
    },
  );
}

export async function getOriginalAsset(photoId: string): Promise<Blob> {
  const asset = await getDatabase().assets.get(photoId);
  if (!asset) throw new Error("The original photo could not be found in local storage.");
  return asset.original;
}

export async function getStorageEstimate(): Promise<StorageEstimate | null> {
  if (!navigator.storage?.estimate) return null;
  return navigator.storage.estimate();
}

export async function requestPersistentStorage(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null;
  return navigator.storage.persist();
}
