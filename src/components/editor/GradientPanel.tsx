"use client";

import { Blend, MousePointer2, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { editorService } from "@/editor/commands/editorService";
import { ADJUSTMENT_DEFINITIONS, DEFAULT_ADJUSTMENTS } from "@/editor/domain/adjustments";
import type { AdjustmentDefinition } from "@/editor/domain/adjustments";
import { getGradientGeometry, MAX_LINEAR_GRADIENTS } from "@/editor/domain/masks";
import type { LinearGradientMask, RuntimePhoto } from "@/editor/domain/types";
import { useEditorStore } from "@/editor/state/store";

function LocalAdjustmentControl({
  definition,
  mask,
  photo,
}: {
  definition: AdjustmentDefinition;
  mask: LinearGradientMask;
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

export function GradientPanel({ photo }: { photo: RuntimePhoto }) {
  const selectedMaskId = useEditorStore((state) => state.selectedMaskId);
  const maskToolMode = useEditorStore((state) => state.maskToolMode);
  const selectedMask = photo.editState.masks.find((mask) => mask.id === selectedMaskId) ?? null;
  const groups = useMemo(() => ({
    light: ADJUSTMENT_DEFINITIONS.filter((item) => item.group === "light"),
    color: ADJUSTMENT_DEFINITIONS.filter((item) => item.group === "color"),
  }), []);
  const toggleDraw = () => editorService.setMaskToolMode(maskToolMode === "create-linear" ? "idle" : "create-linear");

  return (
    <div className="panel-scroll" data-testid="masks-panel">
      <section className="mask-list-section">
        <div className="flex items-center justify-between px-3 pb-2 pt-3">
          <span className="text-[11px] font-medium text-zinc-400">Linear gradients</span>
          <span className="font-mono text-[9px] text-zinc-600">{photo.editState.masks.length}/{MAX_LINEAR_GRADIENTS}</span>
        </div>
        <div className="space-y-1 px-2">
          {photo.editState.masks.map((mask) => (
            <button
              aria-pressed={mask.id === selectedMaskId}
              className={`mask-list-item ${mask.id === selectedMaskId ? "is-active" : ""}`}
              key={mask.id}
              onClick={() => editorService.selectMask(mask.id)}
              type="button"
            >
              <Blend className="size-3.5" />
              <span className="min-w-0 flex-1 truncate text-left">{mask.name}</span>
              <span className="size-1.5 rounded-full bg-zinc-500" />
            </button>
          ))}
        </div>
        <div className="px-2 pb-3 pt-2">
          <Button className="w-full" disabled={photo.editState.masks.length >= MAX_LINEAR_GRADIENTS} onClick={toggleDraw} size="sm" variant={maskToolMode === "create-linear" ? "secondary" : "ghost"}>
            {maskToolMode === "create-linear" ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
            {maskToolMode === "create-linear" ? "Cancel drawing" : "Draw linear gradient"}
          </Button>
        </div>
      </section>

      {maskToolMode === "create-linear" && (
        <div className="mask-draw-hint">
          <MousePointer2 className="size-3.5" />
          Drag across the photo to place the gradient.
        </div>
      )}

      {!selectedMask && maskToolMode !== "create-linear" && (
        <div className="flex min-h-48 flex-col items-center justify-center px-8 text-center">
          <Blend className="mb-3 size-5 text-zinc-600" />
          <p className="text-xs font-medium text-zinc-400">No gradient selected</p>
          <p className="mt-1 text-[11px] leading-5 text-zinc-600">Draw a gradient, then tune its local adjustments here.</p>
        </div>
      )}

      {selectedMask && (
        <div data-testid="selected-mask-controls">
          <section className="panel-section border-t border-white/[0.06]">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-zinc-200">{selectedMask.name}</p>
                <p className="mt-0.5 text-[10px] text-zinc-600">Drag the line or either handle to reposition</p>
              </div>
              <Button aria-label={`Delete ${selectedMask.name}`} onClick={() => editorService.deleteMask(photo.id, selectedMask.id)} size="iconSm" title="Delete gradient" variant="ghost">
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <div className="adjustment-control">
              <div className="mb-1 flex h-6 items-center justify-between">
                <span className="text-xs text-zinc-300">Feather</span>
                <span className="font-mono text-[10px] tabular-nums text-zinc-500">{Math.round(selectedMask.feather * 100)}%</span>
              </div>
              <Slider
                aria-label="Gradient feather"
                max={1}
                min={0.05}
                onValueChange={([feather]) => editorService.previewLinearGradientGeometry(photo.id, selectedMask.id, { ...getGradientGeometry(selectedMask), feather })}
                onValueCommit={([feather]) => editorService.commitLinearGradientGeometry(photo.id, selectedMask.id, { ...getGradientGeometry(selectedMask), feather })}
                step={0.01}
                value={[selectedMask.feather]}
              />
            </div>
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
