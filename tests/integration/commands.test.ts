import { beforeEach, describe, expect, it } from "vitest";

import { editorService } from "@/editor/commands/editorService";
import { createDefaultAdjustments } from "@/editor/domain/adjustments";
import type { RuntimePhoto } from "@/editor/domain/types";
import { resetDatabaseForTests } from "@/editor/persistence/db";
import { initialEditorState, useEditorStore } from "@/editor/state/store";

function testPhoto(): RuntimePhoto {
  return {
    id: "photo-1",
    order: 0,
    name: "portrait.jpg",
    mimeType: "image/jpeg",
    size: 1000,
    width: 100,
    height: 80,
    createdAt: 1,
    updatedAt: 1,
    editState: { adjustments: createDefaultAdjustments() },
    historyCursor: 0,
    previewUrl: "blob:preview",
    thumbnailUrl: "blob:thumb",
  };
}

describe("editor command service", () => {
  beforeEach(async () => {
    await resetDatabaseForTests();
    useEditorStore.setState({
      ...initialEditorState,
      hydrated: true,
      photos: [testPhoto()],
      selectedPhotoId: "photo-1",
      historyByPhoto: { "photo-1": [] },
    });
  });

  it("previews freely but commits one structured event", () => {
    editorService.previewAdjustment("photo-1", "exposure", 0.2);
    editorService.previewAdjustment("photo-1", "exposure", 0.8);
    editorService.commitAdjustment("photo-1", "exposure", 0.8);

    const state = useEditorStore.getState();
    expect(state.photos[0].editState.adjustments.exposure).toBe(0.8);
    expect(state.historyByPhoto["photo-1"]).toHaveLength(1);
    expect(state.historyByPhoto["photo-1"][0]).toMatchObject({
      actor: "user",
      type: "adjustment.changed",
      before: { adjustments: { exposure: 0 } },
      after: { adjustments: { exposure: 0.8 } },
      payload: { property: "exposure", previousValue: 0, nextValue: 0.8 },
    });
  });

  it("undoes, redoes, then removes the abandoned redo tail", () => {
    editorService.previewAdjustment("photo-1", "exposure", 1);
    editorService.commitAdjustment("photo-1", "exposure", 1);
    editorService.previewAdjustment("photo-1", "contrast", 20);
    editorService.commitAdjustment("photo-1", "contrast", 20);
    editorService.undo("photo-1");

    expect(useEditorStore.getState().photos[0].editState.adjustments.contrast).toBe(0);
    editorService.redo("photo-1");
    expect(useEditorStore.getState().photos[0].editState.adjustments.contrast).toBe(20);
    editorService.undo("photo-1");
    editorService.previewAdjustment("photo-1", "saturation", -15);
    editorService.commitAdjustment("photo-1", "saturation", -15);

    const state = useEditorStore.getState();
    expect(state.historyByPhoto["photo-1"]).toHaveLength(2);
    expect(state.historyByPhoto["photo-1"][1].payload.property).toBe("saturation");
    expect(state.photos[0].historyCursor).toBe(2);
  });

  it("cancels an in-progress slider gesture", () => {
    editorService.previewAdjustment("photo-1", "temperature", 40);
    editorService.cancelAdjustment();
    const state = useEditorStore.getState();
    expect(state.photos[0].editState.adjustments.temperature).toBe(0);
    expect(state.historyByPhoto["photo-1"]).toHaveLength(0);
  });

  it("does not create an event when a gesture returns to its baseline", () => {
    editorService.previewAdjustment("photo-1", "tint", 10);
    editorService.previewAdjustment("photo-1", "tint", 0);
    editorService.commitAdjustment("photo-1", "tint", 0);
    expect(useEditorStore.getState().historyByPhoto["photo-1"]).toHaveLength(0);
  });
});
