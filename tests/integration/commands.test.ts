import { beforeEach, describe, expect, it } from "vitest";

import { editorService } from "@/editor/commands/editorService";
import { createDefaultEditState } from "@/editor/domain/adjustments";
import { getGradientGeometry, getRadialGradientGeometry } from "@/editor/domain/masks";
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
    editState: createDefaultEditState(),
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

  it("commits crop, rotate, straighten, and flips through replayable geometry history", () => {
    editorService.previewCrop("photo-1", { x: 0.1, y: 0.1, width: 0.8, height: 0.7 });
    editorService.commitCrop("photo-1", { x: 0.1, y: 0.1, width: 0.8, height: 0.7 });
    editorService.rotate90("photo-1");
    editorService.flipHorizontal("photo-1");
    editorService.previewStraighten("photo-1", 8.5);
    editorService.commitStraighten("photo-1", 8.5);

    let state = useEditorStore.getState();
    expect(state.photos[0].editState.geometry).toMatchObject({
      rotation: 90,
      straighten: 8.5,
      flipHorizontal: true,
    });
    expect(state.historyByPhoto["photo-1"].map((event) => event.type)).toEqual([
      "geometry.changed",
      "geometry.changed",
      "geometry.changed",
      "geometry.changed",
    ]);
    editorService.undo("photo-1");
    expect(useEditorStore.getState().photos[0].editState.geometry.straighten).toBe(0);
    editorService.redo("photo-1");
    state = useEditorStore.getState();
    expect(state.photos[0].editState.geometry.straighten).toBe(8.5);
  });

  it("does not create an event when a gesture returns to its baseline", () => {
    editorService.previewAdjustment("photo-1", "tint", 10);
    editorService.previewAdjustment("photo-1", "tint", 0);
    editorService.commitAdjustment("photo-1", "tint", 0);
    expect(useEditorStore.getState().historyByPhoto["photo-1"]).toHaveLength(0);
  });

  it("creates a normalized gradient and commits one local adjustment event", () => {
    const maskId = editorService.beginLinearGradient("photo-1", 0.2, 0.1);
    expect(maskId).not.toBeNull();
    editorService.previewLinearGradientGeometry("photo-1", maskId!, {
      startX: 0.2,
      startY: 0.1,
      endX: 0.25,
      endY: 0.5,
      feather: 0.7,
    });
    const mask = useEditorStore.getState().photos[0].editState.masks[0];
    if (mask.type !== "linear-gradient") throw new Error("Expected linear gradient");
    editorService.commitLinearGradientGeometry("photo-1", maskId!, getGradientGeometry(mask));
    editorService.previewMaskAdjustment("photo-1", maskId!, "exposure", -0.4);
    editorService.previewMaskAdjustment("photo-1", maskId!, "exposure", -0.8);
    editorService.commitMaskAdjustment("photo-1", maskId!, "exposure", -0.8);

    const state = useEditorStore.getState();
    expect(state.photos[0].editState.masks[0]).toMatchObject({
      id: maskId,
      startX: 0.2,
      endY: 0.5,
      feather: 0.7,
      adjustments: { exposure: -0.8 },
    });
    expect(state.historyByPhoto["photo-1"].map((event) => event.type)).toEqual([
      "mask.created",
      "mask.adjustment.changed",
    ]);
  });

  it("keeps gradient endpoints outside the photo bounds", () => {
    const maskId = editorService.beginLinearGradient("photo-1", 0.2, 0.1)!;
    editorService.previewLinearGradientGeometry("photo-1", maskId, {
      startX: -0.25,
      startY: -0.1,
      endX: 1.3,
      endY: 1.2,
      feather: 0.65,
    });
    const mask = useEditorStore.getState().photos[0].editState.masks[0];
    expect(mask).toMatchObject({ startX: -0.25, startY: -0.1, endX: 1.3, endY: 1.2 });
  });

  it("creates, resizes, inverts, and restores a radial gradient", () => {
    const maskId = editorService.beginRadialGradient("photo-1", 0.5, 0.45)!;
    editorService.previewRadialGradientGeometry("photo-1", maskId, {
      centerX: 0.5,
      centerY: 0.45,
      radiusX: 0.3,
      radiusY: 0.2,
      feather: 0.4,
    });
    let mask = useEditorStore.getState().photos[0].editState.masks[0];
    if (mask.type !== "radial-gradient") throw new Error("Expected radial gradient");
    editorService.commitRadialGradientGeometry("photo-1", maskId, getRadialGradientGeometry(mask));
    editorService.setMaskInverted("photo-1", maskId, true);

    mask = useEditorStore.getState().photos[0].editState.masks[0];
    expect(mask).toMatchObject({
      type: "radial-gradient",
      centerX: 0.5,
      radiusX: 0.3,
      radiusY: 0.2,
      feather: 0.4,
      inverted: true,
    });
    expect(useEditorStore.getState().historyByPhoto["photo-1"].map((event) => event.type)).toEqual([
      "mask.created",
      "mask.geometry.changed",
    ]);

    editorService.undo("photo-1");
    expect(useEditorStore.getState().photos[0].editState.masks[0]).toMatchObject({ inverted: false });
    editorService.redo("photo-1");
    expect(useEditorStore.getState().photos[0].editState.masks[0]).toMatchObject({ inverted: true });
  });

  it("paints, erases, configures, and replays a brush mask", () => {
    const maskId = editorService.beginBrushMask("photo-1")!;
    const strokeId = editorService.beginBrushStroke("photo-1", maskId, { x: 0.2, y: 0.3 })!;
    editorService.previewBrushStroke("photo-1", maskId, strokeId, [
      { x: 0.4, y: 0.45 },
      { x: 0.6, y: 0.5 },
    ]);
    editorService.commitBrushStroke("photo-1", maskId);
    editorService.previewBrushSetting("photo-1", maskId, "density", 0.7);
    editorService.commitBrushSetting("photo-1", maskId, "density", 0.7);
    editorService.setBrushPaintMode("erase");
    const eraseId = editorService.beginBrushStroke("photo-1", maskId, { x: 0.4, y: 0.45 })!;
    editorService.previewBrushStroke("photo-1", maskId, eraseId, [{ x: 0.45, y: 0.45 }]);
    editorService.commitBrushStroke("photo-1", maskId);

    let mask = useEditorStore.getState().photos[0].editState.masks[0];
    expect(mask).toMatchObject({ type: "brush", density: 0.7 });
    if (mask.type !== "brush") throw new Error("Expected brush mask");
    expect(mask.strokes).toHaveLength(2);
    expect(mask.strokes[0].mode).toBe("add");
    expect(mask.strokes[0].points[0]).toEqual({ x: 0.2, y: 0.3 });
    expect(mask.strokes[1]).toMatchObject({ mode: "erase" });
    expect(useEditorStore.getState().historyByPhoto["photo-1"].map((event) => event.type)).toEqual([
      "mask.created",
      "mask.geometry.changed",
      "mask.geometry.changed",
      "mask.geometry.changed",
    ]);

    editorService.undo("photo-1");
    mask = useEditorStore.getState().photos[0].editState.masks[0];
    if (mask.type !== "brush") throw new Error("Expected brush mask");
    expect(mask.strokes).toHaveLength(1);
    editorService.redo("photo-1");
    mask = useEditorStore.getState().photos[0].editState.masks[0];
    if (mask.type !== "brush") throw new Error("Expected brush mask");
    expect(mask.strokes).toHaveLength(2);
  });

  it("undoes and redoes mask geometry, local edits, and deletion", () => {
    const maskId = editorService.beginLinearGradient("photo-1", 0.1, 0.1)!;
    let mask = useEditorStore.getState().photos[0].editState.masks[0];
    if (mask.type !== "linear-gradient") throw new Error("Expected linear gradient");
    editorService.commitLinearGradientGeometry("photo-1", maskId, getGradientGeometry(mask));
    editorService.previewLinearGradientGeometry("photo-1", maskId, { ...getGradientGeometry(mask), endY: 0.8 });
    mask = useEditorStore.getState().photos[0].editState.masks[0];
    if (mask.type !== "linear-gradient") throw new Error("Expected linear gradient");
    editorService.commitLinearGradientGeometry("photo-1", maskId, getGradientGeometry(mask));
    editorService.deleteMask("photo-1", maskId);
    expect(useEditorStore.getState().photos[0].editState.masks).toHaveLength(0);

    editorService.undo("photo-1");
    expect(useEditorStore.getState().photos[0].editState.masks[0]).toMatchObject({ endY: 0.8 });
    editorService.undo("photo-1");
    expect(useEditorStore.getState().photos[0].editState.masks[0]).toMatchObject({ endY: 0.35 });
    editorService.redo("photo-1");
    expect(useEditorStore.getState().photos[0].editState.masks[0]).toMatchObject({ endY: 0.8 });
  });

  it("coalesces curves, color, effects, and detail into structured history", () => {
    const curve = [{ x: 0, y: 0 }, { x: 0.2, y: 0.18 }, { x: 0.55, y: 0.68 }, { x: 1, y: 1 }];
    editorService.previewToneCurve("photo-1", "rgb", curve);
    editorService.commitToneCurve("photo-1", "rgb", curve);
    editorService.previewColorMix("photo-1", "blue", "saturation", -35);
    editorService.commitColorMix("photo-1", "blue", "saturation", -35);
    editorService.previewColorGradeWheel("photo-1", "shadows", 218, 32);
    editorService.previewColorGradeWheel("photo-1", "shadows", 225, 40);
    editorService.commitColorGradeWheel("photo-1", "shadows", 225, 40);
    editorService.previewEffect("photo-1", "dehaze", 24);
    editorService.commitEffect("photo-1", "dehaze", 24);
    editorService.previewDetail("photo-1", "sharpening", 45);
    editorService.commitDetail("photo-1", "sharpening", 45);

    const state = useEditorStore.getState();
    expect(state.photos[0].editState).toMatchObject({
      toneCurve: { rgb: curve },
      colorMix: { blue: { saturation: -35 } },
      colorGrading: { shadows: { hue: 225, saturation: 40 } },
      effects: { dehaze: 24 },
      detail: { sharpening: 45 },
    });
    expect(state.historyByPhoto["photo-1"].map((event) => event.type)).toEqual([
      "curve.changed",
      "colorMix.changed",
      "colorGrading.changed",
      "effect.changed",
      "detail.changed",
    ]);
    editorService.undo("photo-1");
    expect(useEditorStore.getState().photos[0].editState.detail.sharpening).toBe(0);
    editorService.redo("photo-1");
    expect(useEditorStore.getState().photos[0].editState.detail.sharpening).toBe(45);
  });

  it("cancels a live develop setting without creating history", () => {
    editorService.previewEffect("photo-1", "clarity", 80);
    editorService.cancelAdjustment();
    expect(useEditorStore.getState().photos[0].editState.effects.clarity).toBe(0);
    expect(useEditorStore.getState().historyByPhoto["photo-1"]).toHaveLength(0);
  });
});
