"use client";

import { Blend, CircleDashed, Eraser, FlipHorizontal2, Paintbrush, RotateCcw, Trash2, X } from "lucide-react";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { editorService } from "@/editor/commands/editorService";
import { ADJUSTMENT_DEFINITIONS, DEFAULT_ADJUSTMENTS } from "@/editor/domain/adjustments";
import type { AdjustmentDefinition } from "@/editor/domain/adjustments";
import { getGradientGeometry, getRadialGradientGeometry, MAX_GRADIENT_MASKS } from "@/editor/domain/masks";
import type { BrushMask, EditorMask, RuntimePhoto } from "@/editor/domain/types";
import { useEditorStore } from "@/editor/state/store";

function LocalAdjustmentControl({
  definition,
  mask,
  photo,
}: {
  definition: AdjustmentDefinition;
  mask: EditorMask;
  photo: RuntimePhoto;
}) {
  const value = mask.adjustments[definition.key];
  const reset = () => {
    editorService.previewMaskAdjustment(photo.id, mask.id, definition.key, DEFAULT_ADJUSTMENTS[definition.key]);
    editorService.commitMaskAdjustment(photo.id, mask.id, definition.key, DEFAULT_ADJUSTMENTS[definition.key]);
  };
  return (
    <div className="adjustment-control" data-testid={`mask-adjustment-${definition.key}`}>
      <div className="mb-1 flex h-6 items-center justify-between gap-2">
        <button className="text-xs text-zinc-300 hover:text-white" onDoubleClick={reset} type="button">
          {definition.label}
        </button>
        <div className="flex items-center gap-1">
          {value !== DEFAULT_ADJUSTMENTS[definition.key] && (
            <button className="rounded p-1 text-zinc-500 hover:bg-white/5 hover:text-zinc-200" onClick={reset} title={`Reset ${definition.label}`} type="button">
              <RotateCcw className="size-3" />
            </button>
          )}
          <input
            aria-label={`Mask ${definition.label} value`}
            className="h-6 w-14 rounded border border-transparent bg-white/[0.04] px-1.5 text-right font-mono text-[11px] tabular-nums text-zinc-300 outline-none focus:border-white/20 focus:bg-black/20"
            max={definition.max}
            min={definition.min}
            onBlur={(event) => editorService.commitMaskAdjustment(photo.id, mask.id, definition.key, Number(event.currentTarget.value))}
            onChange={(event) => editorService.previewMaskAdjustment(photo.id, mask.id, definition.key, Number(event.currentTarget.value))}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                editorService.cancelAdjustment();
              }
            }}
            step={definition.step}
            type="number"
            value={value}
          />
        </div>
      </div>
      <Slider
        aria-label={`Mask ${definition.label}`}
        max={definition.max}
        min={definition.min}
        onValueChange={([next]) => editorService.previewMaskAdjustment(photo.id, mask.id, definition.key, next)}
        onValueCommit={([next]) => editorService.commitMaskAdjustment(photo.id, mask.id, definition.key, next)}
        step={definition.step}
        value={[value]}
      />
    </div>
  );
}

function BrushSettingControl({
  label,
  mask,
  photo,
  setting,
}: {
  label: string;
  mask: BrushMask;
  photo: RuntimePhoto;
  setting: "size" | "feather" | "flow" | "density";
}) {
  const value = mask[setting];
  return (
    <div className="adjustment-control">
      <div className="mb-1 flex h-6 items-center justify-between">
        <span className="text-xs text-zinc-300">{label}</span>
        <span className="font-mono text-[10px] tabular-nums text-zinc-500">{Math.round(value * 100)}%</span>
      </div>
      <Slider
        aria-label={`Brush ${label}`}
        max={1}
        min={setting === "feather" ? 0 : 0.01}
        onValueChange={([next]) => editorService.previewBrushSetting(photo.id, mask.id, setting, next)}
        onValueCommit={([next]) => editorService.commitBrushSetting(photo.id, mask.id, setting, next)}
        step={0.01}
        value={[value]}
      />
    </div>
  );
}

export function GradientPanel({ photo }: { photo: RuntimePhoto }) {
  const selectedMaskId = useEditorStore((state) => state.selectedMaskId);
  const maskToolMode = useEditorStore((state) => state.maskToolMode);
  const brushPaintMode = useEditorStore((state) => state.brushPaintMode);
  const selectedMask = photo.editState.masks.find((mask) => mask.id === selectedMaskId) ?? null;
  const groups = useMemo(() => ({
    light: ADJUSTMENT_DEFINITIONS.filter((item) => item.group === "light"),
    color: ADJUSTMENT_DEFINITIONS.filter((item) => item.group === "color"),
  }), []);
  const selectTool = (tool: "create-linear" | "create-radial") => {
    editorService.setMaskToolMode(maskToolMode === tool ? "idle" : tool);
  };
  const toggleBrush = () => {
    if (maskToolMode === "paint-brush") {
      editorService.setMaskToolMode("idle");
    } else if (selectedMask?.type === "brush") {
      editorService.setMaskToolMode("paint-brush");
    } else {
      editorService.beginBrushMask(photo.id);
    }
  };

  const previewFeather = (feather: number) => {
    if (!selectedMask) return;
    if (selectedMask.type === "linear-gradient") {
      editorService.previewLinearGradientGeometry(photo.id, selectedMask.id, { ...getGradientGeometry(selectedMask), feather });
    } else if (selectedMask.type === "radial-gradient") {
      editorService.previewRadialGradientGeometry(photo.id, selectedMask.id, { ...getRadialGradientGeometry(selectedMask), feather });
    }
  };

  const commitFeather = (feather: number) => {
    if (!selectedMask) return;
    if (selectedMask.type === "linear-gradient") {
      editorService.commitLinearGradientGeometry(photo.id, selectedMask.id, { ...getGradientGeometry(selectedMask), feather });
    } else if (selectedMask.type === "radial-gradient") {
      editorService.commitRadialGradientGeometry(photo.id, selectedMask.id, { ...getRadialGradientGeometry(selectedMask), feather });
    }
  };

  return (
    <div className="panel-scroll" data-testid="masks-panel">
      <section className="mask-list-section">
        <div className="flex items-center justify-between px-3 pb-2 pt-3">
          <span className="text-[11px] font-medium text-zinc-400">Masks</span>
          <span className="font-mono text-[9px] text-zinc-600">{photo.editState.masks.length}/{MAX_GRADIENT_MASKS}</span>
        </div>
        <div className="grid grid-cols-3 gap-1 px-2 pb-2">
          <Button
            aria-label={maskToolMode === "create-linear" ? "Cancel linear gradient" : "Draw linear gradient"}
            disabled={photo.editState.masks.length >= MAX_GRADIENT_MASKS}
            onClick={() => selectTool("create-linear")}
            size="sm"
            variant={maskToolMode === "create-linear" ? "secondary" : "ghost"}
          >
            {maskToolMode === "create-linear" ? <X className="size-3.5" /> : <Blend className="size-3.5" />} Linear
          </Button>
          <Button
            aria-label={maskToolMode === "create-radial" ? "Cancel radial gradient" : "Draw radial gradient"}
            disabled={photo.editState.masks.length >= MAX_GRADIENT_MASKS}
            onClick={() => selectTool("create-radial")}
            size="sm"
            variant={maskToolMode === "create-radial" ? "secondary" : "ghost"}
          >
            {maskToolMode === "create-radial" ? <X className="size-3.5" /> : <CircleDashed className="size-3.5" />} Radial
          </Button>
          <Button
            aria-label={maskToolMode === "paint-brush" ? "Stop brush painting" : "Draw brush mask"}
            disabled={photo.editState.masks.length >= MAX_GRADIENT_MASKS && selectedMask?.type !== "brush"}
            onClick={toggleBrush}
            size="sm"
            variant={maskToolMode === "paint-brush" ? "secondary" : "ghost"}
          >
            {maskToolMode === "paint-brush" ? <X className="size-3.5" /> : <Paintbrush className="size-3.5" />} Brush
          </Button>
        </div>
        <div className="space-y-1 px-2">
          {photo.editState.masks.map((mask) => (
            <button
              aria-pressed={mask.id === selectedMaskId}
              className={`mask-list-item ${mask.id === selectedMaskId ? "is-active" : ""}`}
              key={mask.id}
              onClick={() => {
                editorService.selectMask(mask.id);
                if (mask.type === "brush") editorService.setMaskToolMode("paint-brush");
              }}
              type="button"
            >
              {mask.type === "linear-gradient" && <Blend className="size-3.5" />}
              {mask.type === "radial-gradient" && <CircleDashed className="size-3.5" />}
              {mask.type === "brush" && <Paintbrush className="size-3.5" />}
              <span className="min-w-0 flex-1 truncate text-left">{mask.name}</span>
              <span className="size-1.5 rounded-full bg-zinc-500" />
            </button>
          ))}
        </div>
        <div className="h-3" />
      </section>

      {selectedMask && (
        <div data-testid="selected-mask-controls">
          <section className="panel-section border-t border-white/[0.06]">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-xs font-medium text-zinc-200">{selectedMask.name}</p>
              <Button
                aria-label={`Delete ${selectedMask.name}`}
                className="h-6 gap-1 px-1.5 text-[10px] text-zinc-500 hover:text-red-300"
                onClick={() => editorService.deleteMask(photo.id, selectedMask.id)}
                size="sm"
                title="Delete selected mask (Delete)"
                variant="ghost"
              >
                <Trash2 className="size-3" /> Delete
              </Button>
            </div>
            <button
              aria-checked={selectedMask.inverted}
              className={`mask-invert-toggle ${selectedMask.inverted ? "is-active" : ""}`}
              onClick={() => editorService.setMaskInverted(photo.id, selectedMask.id, !selectedMask.inverted)}
              role="switch"
              type="button"
            >
              <span className="flex items-center gap-2"><FlipHorizontal2 className="size-3.5" /> Invert mask</span>
              <span className="mask-invert-switch"><span /></span>
            </button>
            {selectedMask.type === "brush" && (
              <div className="space-y-3.5">
                <div className="brush-mode-control" role="group" aria-label="Brush paint mode">
                  <button
                    aria-pressed={brushPaintMode === "add"}
                    className={brushPaintMode === "add" ? "is-active" : ""}
                    onClick={() => editorService.setBrushPaintMode("add")}
                    type="button"
                  ><Paintbrush className="size-3.5" /> Add</button>
                  <button
                    aria-pressed={brushPaintMode === "erase"}
                    className={brushPaintMode === "erase" ? "is-active" : ""}
                    onClick={() => editorService.setBrushPaintMode("erase")}
                    type="button"
                  ><Eraser className="size-3.5" /> Erase</button>
                </div>
                <BrushSettingControl label="Size" mask={selectedMask} photo={photo} setting="size" />
                <BrushSettingControl label="Feather" mask={selectedMask} photo={photo} setting="feather" />
                <BrushSettingControl label="Flow" mask={selectedMask} photo={photo} setting="flow" />
                <BrushSettingControl label="Density" mask={selectedMask} photo={photo} setting="density" />
                <Button
                  className="w-full"
                  disabled={selectedMask.strokes.length === 0}
                  onClick={() => editorService.clearBrushMask(photo.id, selectedMask.id)}
                  size="sm"
                  variant="ghost"
                >Clear brush mask</Button>
              </div>
            )}
            {selectedMask.type !== "brush" && <div className="adjustment-control">
              <div className="mb-1 flex h-6 items-center justify-between">
                <span className="text-xs text-zinc-300">Feather</span>
                <span className="font-mono text-[10px] tabular-nums text-zinc-500">{Math.round(selectedMask.feather * 100)}%</span>
              </div>
              <Slider
                aria-label="Gradient feather"
                max={1}
                min={0.05}
                onValueChange={([feather]) => previewFeather(feather)}
                onValueCommit={([feather]) => commitFeather(feather)}
                step={0.01}
                value={[selectedMask.feather]}
              />
            </div>}
          </section>

          <section className="panel-section border-t border-white/[0.06]">
            <div className="panel-section-heading"><span>Light</span><span className="text-[10px] font-normal text-zinc-600">Local</span></div>
            <div className="space-y-3.5">
              {groups.light.map((definition) => <LocalAdjustmentControl definition={definition} key={definition.key} mask={selectedMask} photo={photo} />)}
            </div>
          </section>
          <section className="panel-section border-t border-white/[0.06]">
            <div className="panel-section-heading">Color</div>
            <div className="space-y-3.5">
              {groups.color.map((definition) => <LocalAdjustmentControl definition={definition} key={definition.key} mask={selectedMask} photo={photo} />)}
            </div>
          </section>
          <div className="px-4 pb-5">
            <Button className="w-full" onClick={() => editorService.resetMaskAdjustments(photo.id, selectedMask.id)} size="sm" variant="secondary">
              <RotateCcw className="size-3.5" /> Reset local adjustments
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
