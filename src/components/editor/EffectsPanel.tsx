"use client";

import { RotateCcw } from "lucide-react";

import { DevelopSlider } from "./DevelopSlider";
import { Button } from "@/components/ui/button";
import { editorService } from "@/editor/commands/editorService";
import { EFFECT_DEFINITIONS } from "@/editor/domain/developSettings";
import type { EffectValues, RuntimePhoto } from "@/editor/domain/types";

const groups: Array<{ label: string; keys: Array<keyof EffectValues> }> = [
  { label: "Presence", keys: ["texture", "clarity", "dehaze"] },
  { label: "Vignette", keys: ["vignette", "vignetteMidpoint", "vignetteRoundness", "vignetteFeather"] },
  { label: "Grain", keys: ["grain", "grainSize", "grainRoughness"] },
];

export function EffectsPanel({ photo }: { photo: RuntimePhoto }) {
  return (
    <div data-testid="effects-panel">
      {groups.map((group, groupIndex) => (
        <section className={`panel-section ${groupIndex > 0 ? "border-t border-white/[0.06]" : ""}`} key={group.label}>
          <div className="panel-section-heading">{group.label}</div>
          <div className="space-y-3.5">
            {group.keys.map((key) => {
              const definition = EFFECT_DEFINITIONS.find((item) => item.key === key)!;
              return <DevelopSlider defaultValue={definition.defaultValue} key={key} label={definition.label} max={definition.max} min={definition.min} onCommit={(value) => editorService.commitEffect(photo.id, key, value)} onPreview={(value) => editorService.previewEffect(photo.id, key, value)} step={definition.step} value={photo.editState.effects[key]} />;
            })}
          </div>
        </section>
      ))}
      <div className="px-4 pb-5"><Button className="w-full" onClick={() => editorService.resetDevelopGroup(photo.id, "effects")} size="sm" variant="secondary"><RotateCcw className="size-3.5" /> Reset effects</Button></div>
    </div>
  );
}
