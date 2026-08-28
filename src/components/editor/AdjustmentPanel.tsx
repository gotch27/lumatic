"use client";

import { Aperture, Crop, Palette, RotateCcw, ScanLine, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { ColorTools } from "./ColorTools";
import { DetailPanel } from "./DetailPanel";
import { EffectsPanel } from "./EffectsPanel";
import { GeometryPanel } from "./GeometryPanel";
import { ToneCurveEditor } from "./ToneCurveEditor";
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
  const [section, setSection] = useState<"light" | "color" | "effects" | "detail" | "geometry">("light");
  const groups = useMemo(
    () => ({
      light: ADJUSTMENT_DEFINITIONS.filter((item) => item.group === "light"),
      color: ADJUSTMENT_DEFINITIONS.filter((item) => item.group === "color"),
    }),
    [],
  );

  return (
    <div className="panel-scroll" data-testid="adjustments-panel">
      <div className="develop-section-tabs" role="tablist" aria-label="Develop tools">
        {([
          ["light", "Light", Aperture],
          ["color", "Color", Palette],
          ["effects", "Effects", Sparkles],
          ["detail", "Detail", ScanLine],
          ["geometry", "Crop", Crop],
        ] as const).map(([key, label, Icon]) => (
          <button
            aria-selected={section === key}
            className={section === key ? "is-active" : ""}
            key={key}
            onClick={() => {
              if (key !== "geometry") editorService.setGeometryToolMode("idle");
              setSection(key);
            }}
            role="tab"
            type="button"
          ><Icon className="size-3" />{label}</button>
        ))}
      </div>
      {section === "light" && <>
        <section className="panel-section">
          <div className="panel-section-heading"><span>Light</span><span className="text-[10px] font-normal tracking-normal text-zinc-600">Global</span></div>
          <div className="space-y-3.5">{groups.light.map((definition) => <AdjustmentControl key={definition.key} definition={definition} photo={photo} />)}</div>
        </section>
        <section className="panel-section border-t border-white/[0.06]">
          <div className="panel-section-heading"><span>Curve</span><span className="text-[10px] font-normal text-zinc-600">Point curve</span></div>
          <ToneCurveEditor photo={photo} />
        </section>
        <div className="px-4 pb-5"><Button className="w-full" onClick={() => editorService.resetAll(photo.id)} size="sm" variant="secondary"><RotateCcw className="size-3.5" /> Reset basic adjustments</Button></div>
      </>}
      {section === "color" && <>
        <section className="panel-section">
          <div className="panel-section-heading"><span>Color</span><span className="text-[10px] font-normal text-zinc-600">Global</span></div>
          <div className="space-y-3.5">{groups.color.map((definition) => <AdjustmentControl key={definition.key} definition={definition} photo={photo} />)}</div>
        </section>
        <ColorTools photo={photo} />
      </>}
      {section === "effects" && <EffectsPanel photo={photo} />}
      {section === "detail" && <DetailPanel photo={photo} />}
      {section === "geometry" && <GeometryPanel photo={photo} />}
    </div>
  );
}
