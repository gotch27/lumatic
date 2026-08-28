import Dexie, { type EntityTable } from "dexie";

import type {
  HistoryEvent,
  PhotoAssetRecord,
  PhotoRecord,
  WorkspaceRecord,
} from "@/editor/domain/types";
import { normalizeEditState } from "@/editor/domain/adjustments";

export class PhotoEditorDatabase extends Dexie {
  workspace!: EntityTable<WorkspaceRecord, "id">;
  photos!: EntityTable<PhotoRecord, "id">;
  assets!: EntityTable<PhotoAssetRecord, "photoId">;
  historyEvents!: EntityTable<HistoryEvent, "id">;

  constructor() {
    super("develop-photo-editor");
    this.version(1).stores({
      workspace: "&id, updatedAt",
      photos: "&id, order, updatedAt",
      assets: "&photoId",
      historyEvents: "&id, photoId, [photoId+sequence], timestamp",
    });
    this.version(2)
      .stores({
        workspace: "&id, updatedAt",
        photos: "&id, order, updatedAt",
        assets: "&photoId",
        historyEvents: "&id, photoId, [photoId+sequence], timestamp",
      })
      .upgrade(async (transaction) => {
        await transaction.table("photos").toCollection().modify((photo) => {
          photo.editState = normalizeEditState(photo.editState);
        });
        await transaction.table("historyEvents").toCollection().modify((event) => {
          event.before = normalizeEditState(event.before);
          event.after = normalizeEditState(event.after);
        });
      });
    this.version(3)
      .stores({
        workspace: "&id, updatedAt",
        photos: "&id, order, updatedAt",
        assets: "&photoId",
        historyEvents: "&id, photoId, [photoId+sequence], timestamp",
      })
      .upgrade(async (transaction) => {
        await transaction.table("photos").toCollection().modify((photo) => {
          photo.editState = normalizeEditState(photo.editState);
        });
        await transaction.table("historyEvents").toCollection().modify((event) => {
          event.before = normalizeEditState(event.before);
          event.after = normalizeEditState(event.after);
        });
      });
    this.version(4)
      .stores({
        workspace: "&id, updatedAt",
        photos: "&id, order, updatedAt",
        assets: "&photoId",
        historyEvents: "&id, photoId, [photoId+sequence], timestamp",
      })
      .upgrade(async (transaction) => {
        await transaction.table("photos").toCollection().modify((photo) => {
          photo.editState = normalizeEditState(photo.editState);
        });
        await transaction.table("historyEvents").toCollection().modify((event) => {
          event.before = normalizeEditState(event.before);
          event.after = normalizeEditState(event.after);
        });
      });
    this.version(5)
      .stores({
        workspace: "&id, updatedAt",
        photos: "&id, order, updatedAt",
        assets: "&photoId",
        historyEvents: "&id, photoId, [photoId+sequence], timestamp",
      })
      .upgrade(async (transaction) => {
        await transaction.table("photos").toCollection().modify((photo) => {
          photo.editState = normalizeEditState(photo.editState);
        });
        await transaction.table("historyEvents").toCollection().modify((event) => {
          event.before = normalizeEditState(event.before);
          event.after = normalizeEditState(event.after);
        });
      });
    this.version(6)
      .stores({
        workspace: "&id, updatedAt",
        photos: "&id, order, updatedAt",
        assets: "&photoId",
        historyEvents: "&id, photoId, [photoId+sequence], timestamp",
      })
      .upgrade(async (transaction) => {
        await transaction.table("photos").toCollection().modify((photo) => {
          photo.editState = normalizeEditState(photo.editState);
        });
        await transaction.table("historyEvents").toCollection().modify((event) => {
          event.before = normalizeEditState(event.before);
          event.after = normalizeEditState(event.after);
        });
      });
  }
}

let database: PhotoEditorDatabase | null = null;

export function getDatabase(): PhotoEditorDatabase {
  if (typeof indexedDB === "undefined") {
    throw new Error("Local browser storage is not available.");
  }
  database ??= new PhotoEditorDatabase();
  return database;
}

export async function resetDatabaseForTests(): Promise<void> {
  if (database) {
    await database.delete();
    database = null;
    return;
  }
  const temporary = new PhotoEditorDatabase();
  await temporary.delete();
}
