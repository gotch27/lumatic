"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { editorService } from "@/editor/commands/editorService";
import {
  CURVE_CHANNELS,
  MAX_TONE_CURVE_POINTS,
  MIN_CURVE_POINT_GAP,
  createDefaultToneCurve,
  evaluateToneCurve,
  normalizeCurvePoints,
} from "@/editor/domain/developSettings";
import type { CurveChannel, CurvePoint, RuntimePhoto } from "@/editor/domain/types";

const SIZE = 230;

export function ToneCurveEditor({ photo }: { photo: RuntimePhoto }) {
  const [channel, setChannel] = useState<CurveChannel>("rgb");
  const [selection, setSelection] = useState<{ photoId: string; channel: CurveChannel; index: number } | null>(null);
  const activePoint = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const points = photo.editState.toneCurve[channel];
  const pointsRef = useRef(points);
  useEffect(() => { pointsRef.current = points; }, [points]);

  const pointFromClient = (clientX: number, clientY: number): CurvePoint | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const bounds = svg.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width)),
      y: Math.min(1, Math.max(0, 1 - (clientY - bounds.top) / bounds.height)),
    };
  };

  useEffect(() => {
    const updatePoint = (clientX: number, clientY: number) => {
      const index = activePoint.current;
      const pointer = pointFromClient(clientX, clientY);
      if (index === null || !pointer) return;
      const current = pointsRef.current;
      const next = current.map((point) => ({ ...point }));
      const minimumX = index === 0 ? 0 : current[index - 1].x + MIN_CURVE_POINT_GAP;
      const maximumX = index === current.length - 1 ? 1 : current[index + 1].x - MIN_CURVE_POINT_GAP;
      const x = Math.min(maximumX, Math.max(minimumX, pointer.x));
      next[index] = { x, y: pointer.y };
      pointsRef.current = normalizeCurvePoints(next);
      editorService.previewToneCurve(photo.id, channel, pointsRef.current);
    };
    const handleMove = (event: PointerEvent) => updatePoint(event.clientX, event.clientY);
    const handleUp = (event: PointerEvent) => {
      if (activePoint.current === null) return;
      updatePoint(event.clientX, event.clientY);
      activePoint.current = null;
      editorService.commitToneCurve(photo.id, channel, pointsRef.current);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [channel, photo.id]);

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const path = [
    `M 0 ${(1 - firstPoint.y) * SIZE}`,
    ...points.map((point) => `L ${point.x * SIZE} ${(1 - point.y) * SIZE}`),
    `L ${SIZE} ${(1 - lastPoint.y) * SIZE}`,
  ].join(" ");
  const channelColor = CURVE_CHANNELS.find((item) => item.key === channel)?.color ?? "#e4e4e7";
  const selectedPoint = selection?.photoId === photo.id && selection.channel === channel ? selection.index : null;
  const canDelete = selectedPoint !== null && selectedPoint > 0 && selectedPoint < points.length - 1;

  const deletePoint = (index: number | null = selectedPoint) => {
    if (index === null || index <= 0 || index >= pointsRef.current.length - 1) return;
    const next = pointsRef.current.filter((_, pointIndex) => pointIndex !== index);
    pointsRef.current = normalizeCurvePoints(next);
    editorService.previewToneCurve(photo.id, channel, pointsRef.current);
    editorService.commitToneCurve(photo.id, channel, pointsRef.current);
    setSelection(null);
  };

  const addPoint = (event: ReactPointerEvent<SVGPathElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (pointsRef.current.length >= MAX_TONE_CURVE_POINTS) return;
    const pointer = pointFromClient(event.clientX, event.clientY);
    if (!pointer) return;
    const nearest = pointsRef.current.findIndex((point) => Math.abs(point.x - pointer.x) < MIN_CURVE_POINT_GAP * 2);
    if (nearest >= 0) {
      setSelection({ photoId: photo.id, channel, index: nearest });
      activePoint.current = nearest;
      svgRef.current?.focus();
      return;
    }
    const added = { x: pointer.x, y: evaluateToneCurve(pointsRef.current, pointer.x) };
    const next = normalizeCurvePoints([...pointsRef.current, added]);
    const index = next.reduce((best, point, pointIndex) => (
      Math.abs(point.x - added.x) < Math.abs(next[best].x - added.x) ? pointIndex : best
    ), 0);
    pointsRef.current = next;
    editorService.previewToneCurve(photo.id, channel, next);
    setSelection({ photoId: photo.id, channel, index });
    activePoint.current = index;
    svgRef.current?.focus();
  };

  return (
    <div className="tone-curve" data-testid="tone-curve-editor">
      <div className="mb-3 flex items-center justify-between">
        <div className="curve-channel-tabs" role="tablist" aria-label="Tone curve channel">
          {CURVE_CHANNELS.map((item) => (
            <button
              aria-selected={channel === item.key}
              className={channel === item.key ? "is-active" : ""}
              key={item.key}
              onClick={() => {
                activePoint.current = null;
                setSelection(null);
                setChannel(item.key);
              }}
              role="tab"
              style={{ "--curve-color": item.color } as React.CSSProperties}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            aria-label="Delete selected curve point"
            className="rounded p-1.5 text-zinc-500 enabled:hover:bg-white/5 enabled:hover:text-zinc-200 disabled:text-zinc-700"
            disabled={!canDelete}
            onClick={() => deletePoint()}
            title="Delete selected point"
            type="button"
          >
            <Trash2 className="size-3" />
          </button>
          <button
            aria-label={`Reset ${channel} curve`}
            className="rounded p-1.5 text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
            onClick={() => {
              const next = createDefaultToneCurve()[channel];
              editorService.previewToneCurve(photo.id, channel, next);
              editorService.commitToneCurve(photo.id, channel, next);
              setSelection(null);
            }}
            title="Reset curve"
            type="button"
          >
            <RotateCcw className="size-3" />
          </button>
        </div>
      </div>
      <svg
        aria-label={`${channel} tone curve`}
        className="curve-graph"
        onKeyDown={(event) => {
          if (event.key === "Delete" || event.key === "Backspace") {
            event.preventDefault();
            deletePoint();
          }
        }}
        preserveAspectRatio="none"
        ref={svgRef}
        role="img"
        tabIndex={0}
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
        <path className="curve-line-hit" d={path} onPointerDown={addPoint} />
        {points.map((point, index) => (
          <circle
            aria-label={`Curve point ${index + 1}`}
            className={`curve-point ${selectedPoint === index ? "is-selected" : ""} ${index === 0 || index === points.length - 1 ? "is-endpoint" : ""}`}
            cx={point.x * SIZE}
            cy={(1 - point.y) * SIZE}
            data-testid={`curve-point-${index}`}
            key={`${channel}-${index}`}
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              deletePoint(index);
            }}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setSelection({ photoId: photo.id, channel, index });
              activePoint.current = index;
              svgRef.current?.focus();
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            r={selectedPoint === index ? "5.5" : "4.5"}
            style={{ fill: channelColor }}
          />
        ))}
      </svg>
      <div className="mt-2 flex justify-between font-mono text-[9px] text-zinc-600"><span>Shadows</span><span>Midtones</span><span>Highlights</span></div>
      <p className="mt-2 text-[9px] leading-4 text-zinc-600">Click the curve to add · drag points freely · double-click or Delete to remove</p>
    </div>
  );
}
