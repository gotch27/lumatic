"use client";

import { Crop, FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw, Ruler } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { editorService } from "@/editor/commands/editorService";
import {
  getGeometryOutputDimensions,
  getOrientedDimensions,
  isGeometryEdited,
  type CropAspectPreset,
} from "@/editor/domain/geometry";
import type { RuntimePhoto } from "@/editor/domain/types";
import { useEditorStore } from "@/editor/state/store";

const ASPECT_PRESETS: Array<{ key: CropAspectPreset; label: string }> = [
  { key: "free", label: "Free" },
  { key: "original", label: "Original" },
  { key: "1:1", label: "1:1" },
  { key: "4:3", label: "4:3" },
  { key: "3:2", label: "3:2" },
  { key: "16:9", label: "16:9" },
];

export function GeometryPanel({ photo }: { photo: RuntimePhoto }) {
  const geometryToolMode = useEditorStore((state) => state.geometryToolMode);
  const geometry = photo.editState.geometry;
  const output = getGeometryOutputDimensions(photo.width, photo.height, geometry);
  const oriented = getOrientedDimensions(photo.width, photo.height, geometry.rotation);
  const outputAspect = output.width / output.height;
  const aspect = ([
    ["original", oriented.width / oriented.height],
    ["1:1", 1],
    ["4:3", 4 / 3],
    ["3:2", 3 / 2],
    ["16:9", 16 / 9],
  ] as const).find(([, ratio]) => Math.abs(outputAspect - ratio) < 0.002)?.[0] ?? "free";

  return (
    <div>
      <section className="panel-section">
        <div className="panel-section-heading">
          <span>Crop</span>
          <span className="font-mono text-[9px] font-normal text-zinc-600">{output.width} × {output.height}</span>
        </div>
        <Button
          aria-pressed={geometryToolMode === "crop"}
          className="mb-3 w-full"
          onClick={() => editorService.setGeometryToolMode(geometryToolMode === "crop" ? "idle" : "crop")}
          size="sm"
          variant={geometryToolMode === "crop" ? "default" : "secondary"}
        >
          <Crop className="size-3.5" /> {geometryToolMode === "crop" ? "Done cropping" : "Edit crop"}
        </Button>
        <div aria-label="Crop aspect ratio" className="crop-preset-grid" role="group">
          {ASPECT_PRESETS.map((preset) => (
            <button
              aria-pressed={aspect === preset.key}
              className={aspect === preset.key ? "is-active" : ""}
              key={preset.key}
              onClick={() => {
                if (preset.key !== "free") editorService.applyCropPreset(photo.id, preset.key);
                editorService.setGeometryToolMode("crop");
              }}
              type="button"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel-section border-t border-white/[0.06]">
        <div className="panel-section-heading"><span>Transform</span><span className="text-[10px] font-normal text-zinc-600">Orientation</span></div>
        <div className="geometry-action-grid">
          <Button aria-label="Rotate 90 degrees clockwise" onClick={() => editorService.rotate90(photo.id)} size="sm" variant="secondary"><RotateCw className="size-3.5" /> Rotate 90°</Button>
          <Button aria-pressed={geometry.flipHorizontal} onClick={() => editorService.flipHorizontal(photo.id)} size="sm" variant={geometry.flipHorizontal ? "default" : "secondary"}><FlipHorizontal2 className="size-3.5" /> Horizontal</Button>
          <Button aria-pressed={geometry.flipVertical} onClick={() => editorService.flipVertical(photo.id)} size="sm" variant={geometry.flipVertical ? "default" : "secondary"}><FlipVertical2 className="size-3.5" /> Vertical</Button>
        </div>
      </section>

      <section className="panel-section border-t border-white/[0.06]">
        <div className="panel-section-heading"><span>Straighten</span><span className="text-[10px] font-normal text-zinc-600">−45° to +45°</span></div>
        <Button
          aria-pressed={geometryToolMode === "straighten"}
          className="mb-3 w-full"
          onClick={() => editorService.setGeometryToolMode(geometryToolMode === "straighten" ? "idle" : "straighten")}
          size="sm"
          variant={geometryToolMode === "straighten" ? "default" : "secondary"}
        >
          <Ruler className="size-3.5" /> Draw horizon line
        </Button>
        <div className="adjustment-control">
          <div className="mb-1 flex h-6 items-center justify-between">
            <span className="text-xs text-zinc-300">Angle</span>
            <input
              aria-label="Straighten angle value"
              className="h-6 w-14 rounded border border-transparent bg-white/[0.04] px-1.5 text-right font-mono text-[11px] text-zinc-300 outline-none focus:border-white/20"
              max={45}
              min={-45}
              onBlur={(event) => editorService.commitStraighten(photo.id, Number(event.currentTarget.value))}
              onChange={(event) => editorService.previewStraighten(photo.id, Number(event.currentTarget.value))}
              step={0.1}
              type="number"
              value={geometry.straighten}
            />
          </div>
          <Slider
            aria-label="Straighten angle"
            max={45}
            min={-45}
            onValueChange={([value]) => editorService.previewStraighten(photo.id, value)}
            onValueCommit={([value]) => editorService.commitStraighten(photo.id, value)}
            step={0.1}
            value={[geometry.straighten]}
          />
        </div>
      </section>

      <div className="px-4 pb-5">
        <Button className="w-full" disabled={!isGeometryEdited(geometry)} onClick={() => editorService.resetGeometry(photo.id)} size="sm" variant="secondary">
          <RotateCcw className="size-3.5" /> Reset crop & geometry
        </Button>
      </div>
    </div>
  );
}
