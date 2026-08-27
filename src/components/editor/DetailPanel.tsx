"use client";

import { RotateCcw } from "lucide-react";

import { DevelopSlider } from "./DevelopSlider";
import { Button } from "@/components/ui/button";
import { editorService } from "@/editor/commands/editorService";
import { DETAIL_DEFINITIONS } from "@/editor/domain/developSettings";
import type { DetailValues, RuntimePhoto } from "@/editor/domain/types";

const groups: Array<{ label: string; description: string; keys: Array<keyof DetailValues> }> = [
  { label: "Sharpening", description: "Evaluate at 100% for accurate detail.", keys: ["sharpening", "sharpeningRadius", "sharpeningDetail", "sharpeningMasking"] },
  { label: "Luminance Noise", description: "Smooth grain while retaining tonal detail.", keys: ["luminanceNoise", "luminanceDetail", "luminanceContrast"] },
  { label: "Color Noise", description: "Reduce colored speckles and chroma variation.", keys: ["colorNoise", "colorNoiseDetail", "colorNoiseSmoothness"] },
];

export function DetailPanel({ photo }: { photo: RuntimePhoto }) {
  return (
    <div data-testid="detail-panel">
      {groups.map((group, groupIndex) => (
        <section className={`panel-section ${groupIndex > 0 ? "border-t border-white/[0.06]" : ""}`} key={group.label}>
          <div className="panel-section-heading mb-1">{group.label}</div>
          <p className="mb-4 text-[10px] leading-4 text-zinc-600">{group.description}</p>
          <div className="space-y-3.5">
            {group.keys.map((key) => {
              const definition = DETAIL_DEFINITIONS.find((item) => item.key === key)!;
              return <DevelopSlider defaultValue={definition.defaultValue} key={key} label={definition.label} max={definition.max} min={definition.min} onCommit={(value) => editorService.commitDetail(photo.id, key, value)} onPreview={(value) => editorService.previewDetail(photo.id, key, value)} step={definition.step} value={photo.editState.detail[key]} />;
            })}
          </div>
        </section>
      ))}
      <div className="px-4 pb-5"><Button className="w-full" onClick={() => editorService.resetDevelopGroup(photo.id, "detail")} size="sm" variant="secondary"><RotateCcw className="size-3.5" /> Reset detail</Button></div>
    </div>
  );
}
