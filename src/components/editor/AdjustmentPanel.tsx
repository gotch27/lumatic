"use client";

import { RotateCcw } from "lucide-react";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { editorService } from "@/editor/commands/editorService";
import { ADJUSTMENT_DEFINITIONS, DEFAULT_ADJUSTMENTS } from "@/editor/domain/adjustments";
import type { AdjustmentDefinition } from "@/editor/domain/adjustments";
import type { RuntimePhoto } from "@/editor/domain/types";

function AdjustmentControl({ photo, definition }: { photo: RuntimePhoto; definition: AdjustmentDefinition }) {
  const value = photo.editState.adjustments[definition.key];
  const isDefault = value === DEFAULT_ADJUSTMENTS[definition.key];

  const reset = () => {
    editorService.previewAdjustment(photo.id, definition.key, DEFAULT_ADJUSTMENTS[definition.key]);
    editorService.commitAdjustment(photo.id, definition.key, DEFAULT_ADJUSTMENTS[definition.key]);
  };

  return (
    <div className="adjustment-control" data-testid={`adjustment-${definition.key}`}>
      <div className="mb-1 flex h-6 items-center justify-between gap-2">
        <button
          className="text-xs text-zinc-300 hover:text-white"
          onDoubleClick={reset}
          title="Double-click to reset"
          type="button"
        >
          {definition.label}
        </button>
        <div className="flex items-center gap-1">
          {!isDefault && (
            <button
              className="rounded p-1 text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
              onClick={reset}
              title={`Reset ${definition.label}`}
              type="button"
            >
              <RotateCcw className="size-3" />
            </button>
          )}
          <input
            aria-label={`${definition.label} value`}
            className="h-6 w-14 rounded border border-transparent bg-white/[0.04] px-1.5 text-right font-mono text-[11px] tabular-nums text-zinc-300 outline-none focus:border-white/20 focus:bg-black/20"
            max={definition.max}
            min={definition.min}
            onBlur={(event) => editorService.commitAdjustment(photo.id, definition.key, Number(event.currentTarget.value))}
            onChange={(event) => editorService.previewAdjustment(photo.id, definition.key, Number(event.currentTarget.value))}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                editorService.cancelAdjustment();
                event.currentTarget.blur();
              }
            }}
            step={definition.step}
            type="number"
            value={value}
          />
        </div>
      </div>
      <Slider
        aria-label={definition.label}
        max={definition.max}
        min={definition.min}
        onValueChange={([next]) => editorService.previewAdjustment(photo.id, definition.key, next)}
        onValueCommit={([next]) => editorService.commitAdjustment(photo.id, definition.key, next)}
        step={definition.step}
        value={[value]}
      />
    </div>
  );
}

export function AdjustmentPanel({ photo }: { photo: RuntimePhoto }) {
  const groups = useMemo(
    () => ({
      light: ADJUSTMENT_DEFINITIONS.filter((item) => item.group === "light"),
      color: ADJUSTMENT_DEFINITIONS.filter((item) => item.group === "color"),
    }),
    [],
  );

  return (
    <div className="panel-scroll" data-testid="adjustments-panel">
      <section className="panel-section">
        <div className="panel-section-heading">
          <span>Light</span>
          <span className="text-[10px] font-normal tracking-normal text-zinc-600">Global</span>
        </div>
        <div className="space-y-3.5">
          {groups.light.map((definition) => (
            <AdjustmentControl key={definition.key} definition={definition} photo={photo} />
          ))}
        </div>
      </section>
      <section className="panel-section border-t border-white/[0.06]">
        <div className="panel-section-heading">Color</div>
        <div className="space-y-3.5">
          {groups.color.map((definition) => (
            <AdjustmentControl key={definition.key} definition={definition} photo={photo} />
          ))}
        </div>
      </section>
      <div className="px-4 pb-5">
        <Button className="w-full" onClick={() => editorService.resetAll(photo.id)} size="sm" variant="secondary">
          <RotateCcw className="size-3.5" />
          Reset all adjustments
        </Button>
      </div>
    </div>
  );
}
