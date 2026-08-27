"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { DevelopSlider } from "./DevelopSlider";
import { Button } from "@/components/ui/button";
import { editorService } from "@/editor/commands/editorService";
import {
  COLOR_GRADE_RANGES,
  COLOR_MIX_CHANNELS,
  COLOR_MIX_PROPERTIES,
} from "@/editor/domain/developSettings";
import type { ColorGradeRange, ColorMixChannel, RuntimePhoto } from "@/editor/domain/types";

function GradeWheel({ photo, range }: { photo: RuntimePhoto; range: ColorGradeRange }) {
  const dragging = useRef(false);
  const current = photo.editState.colorGrading[range];
  const values = useRef({ hue: current.hue, saturation: current.saturation });
  useEffect(() => {
    values.current = { hue: current.hue, saturation: current.saturation };
  }, [current.hue, current.saturation]);
  const update = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left - bounds.width / 2;
    const y = event.clientY - bounds.top - bounds.height / 2;
    const hue = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    const saturation = Math.min(100, Math.hypot(x, y) / (bounds.width * 0.42) * 100);
    values.current = { hue, saturation };
    editorService.previewColorGradeWheel(photo.id, range, hue, saturation);
  };
  const angle = current.hue * Math.PI / 180;
  const radius = current.saturation * 0.39;
  return (
    <div
      aria-label={`${range} color wheel`}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={current.saturation}
      className="color-wheel"
      data-testid="color-grade-wheel"
      onPointerDown={(event) => {
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        update(event);
      }}
      onPointerMove={update}
      onPointerUp={(event) => {
        if (!dragging.current) return;
        update(event);
        dragging.current = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
        editorService.commitColorGradeWheel(photo.id, range, values.current.hue, values.current.saturation);
      }}
      role="slider"
      tabIndex={0}
    >
      <div
        className="color-wheel-handle"
        style={{
          left: `${50 + Math.cos(angle) * radius}%`,
          top: `${50 + Math.sin(angle) * radius}%`,
          background: `hsl(${current.hue} 85% 62%)`,
        }}
      />
    </div>
  );
}

export function ColorTools({ photo }: { photo: RuntimePhoto }) {
  const [mixChannel, setMixChannel] = useState<ColorMixChannel>("red");
  const [gradeRange, setGradeRange] = useState<ColorGradeRange>("shadows");
  const mix = photo.editState.colorMix[mixChannel];
  const grade = photo.editState.colorGrading[gradeRange];

  return (
    <>
      <section className="panel-section border-t border-white/[0.06]" data-testid="color-mix-panel">
        <div className="panel-section-heading">
          <span>Color Mix</span>
          <button className="text-zinc-600 hover:text-zinc-300" onClick={() => editorService.resetDevelopGroup(photo.id, "colorMix")} type="button"><RotateCcw className="size-3" /></button>
        </div>
        <div className="color-channel-row" role="tablist" aria-label="Color mix channel">
          {COLOR_MIX_CHANNELS.map((item) => (
            <button aria-label={item.label} aria-selected={mixChannel === item.key} className={mixChannel === item.key ? "is-active" : ""} key={item.key} onClick={() => setMixChannel(item.key)} role="tab" type="button">
              <span style={{ background: item.color }} />
            </button>
          ))}
        </div>
        <p className="mb-3 mt-2 text-center text-[10px] font-medium text-zinc-500">{COLOR_MIX_CHANNELS.find((item) => item.key === mixChannel)?.label}</p>
        <div className="space-y-3.5">
          {COLOR_MIX_PROPERTIES.map((definition) => (
            <DevelopSlider
              ariaPrefix={`${COLOR_MIX_CHANNELS.find((item) => item.key === mixChannel)?.label} `}
              defaultValue={definition.defaultValue}
              key={definition.key}
              label={definition.label}
              max={definition.max}
              min={definition.min}
              onCommit={(value) => editorService.commitColorMix(photo.id, mixChannel, definition.key, value)}
              onPreview={(value) => editorService.previewColorMix(photo.id, mixChannel, definition.key, value)}
              step={definition.step}
              value={mix[definition.key]}
            />
          ))}
        </div>
      </section>

      <section className="panel-section border-t border-white/[0.06]" data-testid="color-grading-panel">
        <div className="panel-section-heading">
          <span>Color Grading</span>
          <button className="text-zinc-600 hover:text-zinc-300" onClick={() => editorService.resetDevelopGroup(photo.id, "colorGrading")} type="button"><RotateCcw className="size-3" /></button>
        </div>
        <div className="grade-range-tabs" role="tablist" aria-label="Color grading range">
          {COLOR_GRADE_RANGES.map((item) => <button aria-selected={gradeRange === item.key} className={gradeRange === item.key ? "is-active" : ""} key={item.key} onClick={() => setGradeRange(item.key)} role="tab" type="button">{item.label}</button>)}
        </div>
        <GradeWheel photo={photo} range={gradeRange} />
        <div className="mt-4 space-y-3.5">
          <DevelopSlider ariaPrefix={`${gradeRange} `} defaultValue={0} label="Hue" max={360} min={0} onCommit={(value) => editorService.commitColorGrade(photo.id, gradeRange, "hue", value)} onPreview={(value) => editorService.previewColorGrade(photo.id, gradeRange, "hue", value)} step={1} value={grade.hue} />
          <DevelopSlider ariaPrefix={`${gradeRange} `} defaultValue={0} label="Saturation" max={100} min={0} onCommit={(value) => editorService.commitColorGrade(photo.id, gradeRange, "saturation", value)} onPreview={(value) => editorService.previewColorGrade(photo.id, gradeRange, "saturation", value)} step={1} value={grade.saturation} />
          <DevelopSlider ariaPrefix={`${gradeRange} `} defaultValue={0} label="Luminance" max={100} min={-100} onCommit={(value) => editorService.commitColorGrade(photo.id, gradeRange, "luminance", value)} onPreview={(value) => editorService.previewColorGrade(photo.id, gradeRange, "luminance", value)} step={1} value={grade.luminance} />
        </div>
        <div className="my-4 border-t border-white/[0.06]" />
        <div className="space-y-3.5">
          <DevelopSlider defaultValue={50} label="Blending" max={100} min={0} onCommit={(value) => editorService.commitColorGradeMaster(photo.id, "blending", value)} onPreview={(value) => editorService.previewColorGradeMaster(photo.id, "blending", value)} step={1} value={photo.editState.colorGrading.blending} />
          <DevelopSlider defaultValue={0} label="Balance" max={100} min={-100} onCommit={(value) => editorService.commitColorGradeMaster(photo.id, "balance", value)} onPreview={(value) => editorService.previewColorGradeMaster(photo.id, "balance", value)} step={1} value={photo.editState.colorGrading.balance} />
        </div>
      </section>
      <div className="px-4 pb-5"><Button className="w-full" onClick={() => editorService.resetDevelopGroup(photo.id, "colorGrading")} size="sm" variant="secondary"><RotateCcw className="size-3.5" /> Reset color grading</Button></div>
    </>
  );
}
