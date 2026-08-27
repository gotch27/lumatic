"use client";

import { RotateCcw } from "lucide-react";

import { Slider } from "@/components/ui/slider";
import { editorService } from "@/editor/commands/editorService";

interface DevelopSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  ariaPrefix?: string;
  onPreview: (value: number) => void;
  onCommit: (value: number) => void;
}

export function DevelopSlider({
  label,
  value,
  min,
  max,
  step,
  defaultValue,
  ariaPrefix = "",
  onPreview,
  onCommit,
}: DevelopSliderProps) {
  const reset = () => {
    onPreview(defaultValue);
    onCommit(defaultValue);
  };
  const ariaLabel = `${ariaPrefix}${label}`;
  return (
    <div className="adjustment-control" data-testid={`develop-${ariaLabel.toLowerCase().replaceAll(" ", "-")}`}>
      <div className="mb-1 flex h-6 items-center justify-between gap-2">
        <button className="text-xs text-zinc-300 hover:text-white" onDoubleClick={reset} title="Double-click to reset" type="button">
          {label}
        </button>
        <div className="flex items-center gap-1">
          {value !== defaultValue && (
            <button aria-label={`Reset ${ariaLabel}`} className="rounded p-1 text-zinc-500 hover:bg-white/5 hover:text-zinc-200" onClick={reset} type="button">
              <RotateCcw className="size-3" />
            </button>
          )}
          <input
            aria-label={`${ariaLabel} value`}
            className="h-6 w-14 rounded border border-transparent bg-white/[0.04] px-1.5 text-right font-mono text-[11px] tabular-nums text-zinc-300 outline-none focus:border-white/20 focus:bg-black/20"
            max={max}
            min={min}
            onBlur={(event) => onCommit(Number(event.currentTarget.value))}
            onChange={(event) => onPreview(Number(event.currentTarget.value))}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                editorService.cancelAdjustment();
              }
            }}
            step={step}
            type="number"
            value={value}
          />
        </div>
      </div>
      <Slider
        aria-label={ariaLabel}
        max={max}
        min={min}
        onValueChange={([next]) => onPreview(next)}
        onValueCommit={([next]) => onCommit(next)}
        step={step}
        value={[value]}
      />
    </div>
  );
}
