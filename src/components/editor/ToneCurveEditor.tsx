"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { editorService } from "@/editor/commands/editorService";
import { CURVE_CHANNELS, createDefaultToneCurve, normalizeCurveValues } from "@/editor/domain/developSettings";
import type { CurveChannel, RuntimePhoto } from "@/editor/domain/types";

const SIZE = 230;

export function ToneCurveEditor({ photo }: { photo: RuntimePhoto }) {
  const [channel, setChannel] = useState<CurveChannel>("rgb");
  const activePoint = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const valuesRef = useRef(photo.editState.toneCurve[channel]);
  const values = photo.editState.toneCurve[channel];
  useEffect(() => { valuesRef.current = values; }, [values]);

  useEffect(() => {
    const updatePoint = (clientY: number) => {
      if (activePoint.current === null || !svgRef.current) return;
      const bounds = svgRef.current.getBoundingClientRect();
      const value = 1 - (clientY - bounds.top) / bounds.height;
      const next = normalizeCurveValues(valuesRef.current);
      next[activePoint.current] = Math.min(1, Math.max(0, value));
      valuesRef.current = next;
      editorService.previewToneCurve(photo.id, channel, next);
    };
    const handleMove = (event: PointerEvent) => updatePoint(event.clientY);
    const handleUp = (event: PointerEvent) => {
      if (activePoint.current === null) return;
      updatePoint(event.clientY);
      activePoint.current = null;
      editorService.commitToneCurve(photo.id, channel, valuesRef.current);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [channel, photo.id]);

  const path = values.map((value, index) => `${index === 0 ? "M" : "L"} ${(index / 4) * SIZE} ${(1 - value) * SIZE}`).join(" ");
  const channelColor = CURVE_CHANNELS.find((item) => item.key === channel)?.color ?? "#e4e4e7";

  return (
    <div className="tone-curve" data-testid="tone-curve-editor">
      <div className="mb-3 flex items-center justify-between">
        <div className="curve-channel-tabs" role="tablist" aria-label="Tone curve channel">
          {CURVE_CHANNELS.map((item) => (
            <button
              aria-selected={channel === item.key}
              className={channel === item.key ? "is-active" : ""}
              key={item.key}
              onClick={() => setChannel(item.key)}
              role="tab"
              style={{ "--curve-color": item.color } as React.CSSProperties}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          aria-label={`Reset ${channel} curve`}
          className="rounded p-1.5 text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
          onClick={() => {
            const next = createDefaultToneCurve()[channel];
            editorService.previewToneCurve(photo.id, channel, next);
            editorService.commitToneCurve(photo.id, channel, next);
          }}
          type="button"
        >
          <RotateCcw className="size-3" />
        </button>
      </div>
      <svg
        aria-label={`${channel} tone curve`}
        className="curve-graph"
        preserveAspectRatio="none"
        ref={svgRef}
        role="img"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
      >
        <defs>
          <linearGradient id="curve-histogram" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="rgba(255,255,255,.08)" />
            <stop offset="1" stopColor="rgba(255,255,255,.01)" />
          </linearGradient>
        </defs>
        <path className="curve-histogram" d={`M0 ${SIZE} C35 205 45 70 88 138 C120 190 138 34 175 92 C205 132 218 55 ${SIZE} 0 L${SIZE} ${SIZE} Z`} />
        {[0.25, 0.5, 0.75].map((line) => <path className="curve-grid" d={`M0 ${line * SIZE} H${SIZE} M${line * SIZE} 0 V${SIZE}`} key={line} />)}
        <path className="curve-diagonal" d={`M0 ${SIZE} L${SIZE} 0`} />
        <path className="curve-line" d={path} style={{ stroke: channelColor }} />
        {values.map((value, index) => (
          <circle
            aria-label={`Curve point ${index + 1}`}
            className="curve-point"
            cx={(index / 4) * SIZE}
            cy={(1 - value) * SIZE}
            data-testid={`curve-point-${index}`}
            key={index}
            onPointerDown={(event) => {
              event.preventDefault();
              activePoint.current = index;
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            r="5"
            style={{ fill: channelColor }}
          />
        ))}
      </svg>
      <div className="mt-2 flex justify-between font-mono text-[9px] text-zinc-600"><span>Shadows</span><span>Midtones</span><span>Highlights</span></div>
    </div>
  );
}
