"use client";

import { Focus, Maximize2, ZoomIn } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { Button } from "@/components/ui/button";
import { editorService } from "@/editor/commands/editorService";
import { createDefaultEditState } from "@/editor/domain/adjustments";
import {
  getGradientGeometry,
  getRadialGradientGeometry,
  type LinearGradientGeometry,
  type RadialGradientGeometry,
} from "@/editor/domain/masks";
import type { GradientMask, LinearGradientMask, RadialGradientMask, RuntimePhoto } from "@/editor/domain/types";
import { PhotoRenderer } from "@/editor/renderer/PhotoRenderer";
import { useEditorStore } from "@/editor/state/store";

interface CreateDrag {
  maskId: string;
  type: "linear-gradient" | "radial-gradient";
  startX: number;
  startY: number;
}

interface LinearMaskDrag {
  maskId: string;
  type: "linear-gradient";
  kind: "start" | "end" | "move";
  initial: LinearGradientGeometry;
  pointerStartX: number;
  pointerStartY: number;
}

interface RadialMaskDrag {
  maskId: string;
  type: "radial-gradient";
  kind: "center" | "radius-x" | "radius-y" | "move";
  initial: RadialGradientGeometry;
  pointerStartX: number;
  pointerStartY: number;
}

type MaskDrag = LinearMaskDrag | RadialMaskDrag;

interface LinearOverlayMask {
  type: "linear-gradient";
  mask: LinearGradientMask;
  start: { x: number; y: number };
  end: { x: number; y: number };
}

interface RadialOverlayMask {
  type: "radial-gradient";
  mask: RadialGradientMask;
  center: { x: number; y: number };
  radiusX: number;
  radiusY: number;
}

type OverlayMask = LinearOverlayMask | RadialOverlayMask;

function latestMask(photoId: string, maskId: string): GradientMask | null {
  const photo = useEditorStore.getState().photos.find((item) => item.id === photoId);
  return photo?.editState.masks.find((mask) => mask.id === maskId) ?? null;
}

export default function PhotoCanvas({ photo, showOriginal }: { photo: RuntimePhoto; showOriginal: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<PhotoRenderer | null>(null);
  const panRef = useRef<{ x: number; y: number } | null>(null);
  const createDragRef = useRef<CreateDrag | null>(null);
  const maskDragRef = useRef<MaskDrag | null>(null);
  const maskToolMode = useEditorStore((state) => state.maskToolMode);
  const selectedMaskId = useEditorStore((state) => state.selectedMaskId);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [transformVersion, setTransformVersion] = useState(0);
  const [overlayMasks, setOverlayMasks] = useState<OverlayMask[]>([]);
  const [imageTopLeft, setImageTopLeft] = useState<{ x: number; y: number } | null>(null);

  const pointFromEvent = (clientX: number, clientY: number) => {
    const host = hostRef.current;
    const renderer = rendererRef.current;
    if (!host || !renderer) return null;
    const bounds = host.getBoundingClientRect();
    return renderer.screenToImage(clientX - bounds.left, clientY - bounds.top);
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = new PhotoRenderer();
    rendererRef.current = renderer;
    let active = true;
    renderer
      .mount(host, photo.editState, () => {
        if (active) setTransformVersion((version) => version + 1);
      })
      .then(() => {
        if (!active) {
          renderer.destroy();
          return;
        }
        return renderer.setPhoto(photo.previewUrl);
      })
      .then(() => {
        if (active) {
          setReady(true);
          setZoom(renderer.getZoomPercent());
          setTransformVersion((version) => version + 1);
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "WebGL could not start.");
      });
    return () => {
      active = false;
      renderer.destroy();
      rendererRef.current = null;
    };
    // The renderer is intentionally mounted once and receives photo changes below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !ready) return;
    renderer.setPhoto(photo.previewUrl).then(() => {
      setZoom(renderer.getZoomPercent());
      setTransformVersion((version) => version + 1);
    }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "The photo preview could not be displayed.");
    });
  }, [photo.id, photo.previewUrl, ready]);

  useEffect(() => {
    rendererRef.current?.setEditState(showOriginal ? createDefaultEditState() : photo.editState);
  }, [photo.editState, showOriginal]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || showOriginal) {
      setOverlayMasks([]);
      return;
    }
    setOverlayMasks(photo.editState.masks.flatMap((mask): OverlayMask[] => {
      if (mask.type === "linear-gradient") {
        const start = renderer.imageToScreen(mask.startX, mask.startY);
        const end = renderer.imageToScreen(mask.endX, mask.endY);
        return start && end ? [{ type: "linear-gradient", mask, start, end }] : [];
      }
      const center = renderer.imageToScreen(mask.centerX, mask.centerY);
      const horizontal = renderer.imageToScreen(mask.centerX + mask.radiusX, mask.centerY);
      const vertical = renderer.imageToScreen(mask.centerX, mask.centerY + mask.radiusY);
      return center && horizontal && vertical ? [{
        type: "radial-gradient",
        mask,
        center,
        radiusX: Math.abs(horizontal.x - center.x),
        radiusY: Math.abs(vertical.y - center.y),
      }] : [];
    }));
  }, [photo.editState.masks, showOriginal, transformVersion]);

  useEffect(() => {
    const renderer = rendererRef.current;
    setImageTopLeft(ready && renderer ? renderer.imageToScreen(0, 0) : null);
  }, [photo.id, ready, transformVersion]);

  const fit = () => {
    rendererRef.current?.fit();
    setZoom(rendererRef.current?.getZoomPercent() ?? 100);
    setTransformVersion((version) => version + 1);
  };
  const actual = () => {
    rendererRef.current?.actualSize();
    setZoom(100);
    setTransformVersion((version) => version + 1);
  };

  const startMaskDrag = (
    event: ReactPointerEvent<SVGElement>,
    mask: GradientMask,
    kind: "start" | "end" | "center" | "radius-x" | "radius-y" | "move",
  ) => {
    const point = pointFromEvent(event.clientX, event.clientY);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    editorService.selectMask(mask.id);
    if (mask.type === "linear-gradient" && (kind === "start" || kind === "end" || kind === "move")) {
      maskDragRef.current = {
        maskId: mask.id,
        type: "linear-gradient",
        kind,
        initial: getGradientGeometry(mask),
        pointerStartX: point.x,
        pointerStartY: point.y,
      };
    } else if (mask.type === "radial-gradient" && (kind === "center" || kind === "radius-x" || kind === "radius-y" || kind === "move")) {
      maskDragRef.current = {
        maskId: mask.id,
        type: "radial-gradient",
        kind,
        initial: getRadialGradientGeometry(mask),
        pointerStartX: point.x,
        pointerStartY: point.y,
      };
    }
  };

  const moveMaskDrag = (event: ReactPointerEvent<SVGElement>) => {
    const drag = maskDragRef.current;
    if (!drag) return;
    const point = pointFromEvent(event.clientX, event.clientY);
    if (!point) return;
    if (drag.type === "linear-gradient") {
      let geometry = { ...drag.initial };
      if (drag.kind === "start") {
        geometry = { ...geometry, startX: point.x, startY: point.y };
      } else if (drag.kind === "end") {
        geometry = { ...geometry, endX: point.x, endY: point.y };
      } else {
        const deltaX = point.x - drag.pointerStartX;
        const deltaY = point.y - drag.pointerStartY;
        geometry = {
          ...geometry,
          startX: geometry.startX + deltaX,
          startY: geometry.startY + deltaY,
          endX: geometry.endX + deltaX,
          endY: geometry.endY + deltaY,
        };
      }
      editorService.previewLinearGradientGeometry(photo.id, drag.maskId, geometry);
      return;
    }
    let geometry = { ...drag.initial };
    if (drag.kind === "radius-x") {
      geometry = { ...geometry, radiusX: Math.max(0.005, Math.abs(point.x - geometry.centerX)) };
    } else if (drag.kind === "radius-y") {
      geometry = { ...geometry, radiusY: Math.max(0.005, Math.abs(point.y - geometry.centerY)) };
    } else {
      const deltaX = point.x - drag.pointerStartX;
      const deltaY = point.y - drag.pointerStartY;
      geometry = {
        ...geometry,
        centerX: geometry.centerX + deltaX,
        centerY: geometry.centerY + deltaY,
      };
    }
    editorService.previewRadialGradientGeometry(photo.id, drag.maskId, geometry);
  };

  const finishMaskDrag = (event: ReactPointerEvent<SVGElement>) => {
    const drag = maskDragRef.current;
    if (!drag) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const mask = latestMask(photo.id, drag.maskId);
    if (mask?.type === "linear-gradient") {
      editorService.commitLinearGradientGeometry(photo.id, drag.maskId, getGradientGeometry(mask));
    } else if (mask?.type === "radial-gradient") {
      editorService.commitRadialGradientGeometry(photo.id, drag.maskId, getRadialGradientGeometry(mask));
    }
    maskDragRef.current = null;
  };

  return (
    <div className="photo-stage" data-testid="photo-stage">
      <div
        className={`photo-canvas-host ${maskToolMode !== "idle" ? "is-drawing-mask" : ""}`}
        onPointerDown={(event) => {
          if (maskToolMode !== "idle") {
            const point = pointFromEvent(event.clientX, event.clientY);
            if (!point) return;
            const isLinear = maskToolMode === "create-linear";
            const maskId = isLinear
              ? editorService.beginLinearGradient(photo.id, point.x, point.y)
              : editorService.beginRadialGradient(photo.id, point.x, point.y);
            if (!maskId) return;
            createDragRef.current = {
              maskId,
              type: isLinear ? "linear-gradient" : "radial-gradient",
              startX: point.x,
              startY: point.y,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
            return;
          }
          editorService.selectMask(null);
          panRef.current = { x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const createDrag = createDragRef.current;
          if (createDrag) {
            const point = pointFromEvent(event.clientX, event.clientY);
            if (point) {
              if (createDrag.type === "linear-gradient") {
                editorService.previewLinearGradientGeometry(photo.id, createDrag.maskId, {
                  startX: createDrag.startX,
                  startY: createDrag.startY,
                  endX: point.x,
                  endY: point.y,
                  feather: 0.65,
                });
              } else {
                const radiusInPixels = Math.hypot(
                  (point.x - createDrag.startX) * photo.width,
                  (point.y - createDrag.startY) * photo.height,
                );
                editorService.previewRadialGradientGeometry(photo.id, createDrag.maskId, {
                  centerX: createDrag.startX,
                  centerY: createDrag.startY,
                  radiusX: radiusInPixels / photo.width,
                  radiusY: radiusInPixels / photo.height,
                  feather: 0.65,
                });
              }
            }
            return;
          }
          const pan = panRef.current;
          if (!pan) return;
          rendererRef.current?.panBy(event.clientX - pan.x, event.clientY - pan.y);
          panRef.current = { x: event.clientX, y: event.clientY };
          setTransformVersion((version) => version + 1);
        }}
        onPointerUp={(event) => {
          const createDrag = createDragRef.current;
          if (createDrag) {
            const mask = latestMask(photo.id, createDrag.maskId);
            if (mask?.type === "linear-gradient") {
              editorService.commitLinearGradientGeometry(photo.id, createDrag.maskId, getGradientGeometry(mask));
            } else if (mask?.type === "radial-gradient") {
              editorService.commitRadialGradientGeometry(photo.id, createDrag.maskId, getRadialGradientGeometry(mask));
            }
            createDragRef.current = null;
          }
          panRef.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onWheel={(event) => {
          event.preventDefault();
          const bounds = event.currentTarget.getBoundingClientRect();
          rendererRef.current?.zoomAt(event.deltaY, event.clientX - bounds.left, event.clientY - bounds.top);
          setZoom(rendererRef.current?.getZoomPercent() ?? zoom);
          setTransformVersion((version) => version + 1);
        }}
        ref={hostRef}
      />

      {ready && overlayMasks.length > 0 && (
        <svg aria-label="Gradient overlay" className="gradient-overlay" data-testid="gradient-overlay">
          {overlayMasks.map((overlay) => {
            if (overlay.type === "radial-gradient") {
              const { mask, center, radiusX, radiusY } = overlay;
              const selected = mask.id === selectedMaskId;
              const sharedHandlers = {
                onPointerMove: moveMaskDrag,
                onPointerUp: finishMaskDrag,
                onPointerCancel: finishMaskDrag,
              };
              return (
                <g className={selected ? "is-selected" : ""} key={mask.id}>
                  <ellipse
                    {...sharedHandlers}
                    className="radial-boundary-hit"
                    data-testid={`radial-gradient-${mask.id}`}
                    onPointerDown={(event) => startMaskDrag(event, mask, "move")}
                    cx={center.x}
                    cy={center.y}
                    rx={radiusX}
                    ry={radiusY}
                  />
                  <ellipse
                    className={`radial-boundary ${selected ? "is-selected" : ""}`}
                    cx={center.x}
                    cy={center.y}
                    rx={radiusX}
                    ry={radiusY}
                  />
                  {selected && (
                    <>
                      <line className="radial-axis" x1={center.x - radiusX} x2={center.x + radiusX} y1={center.y} y2={center.y} />
                      <line className="radial-axis" x1={center.x} x2={center.x} y1={center.y - radiusY} y2={center.y + radiusY} />
                      <circle
                        {...sharedHandlers}
                        className="gradient-handle radial-center-handle"
                        data-testid="radial-gradient-center"
                        onPointerDown={(event) => startMaskDrag(event, mask, "center")}
                        cx={center.x}
                        cy={center.y}
                        r="5"
                      />
                      <circle
                        {...sharedHandlers}
                        className="gradient-handle gradient-handle-end"
                        data-testid="radial-gradient-radius-x"
                        onPointerDown={(event) => startMaskDrag(event, mask, "radius-x")}
                        cx={center.x + radiusX}
                        cy={center.y}
                        r="6"
                      />
                      <circle
                        {...sharedHandlers}
                        className="gradient-handle gradient-handle-end"
                        data-testid="radial-gradient-radius-y"
                        onPointerDown={(event) => startMaskDrag(event, mask, "radius-y")}
                        cx={center.x}
                        cy={center.y + radiusY}
                        r="6"
                      />
                    </>
                  )}
                </g>
              );
            }
            const { mask, start, end } = overlay;
            const selected = mask.id === selectedMaskId;
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const length = Math.max(1, Math.hypot(dx, dy));
            const perpendicularX = (-dy / length) * 1400;
            const perpendicularY = (dx / length) * 1400;
            const sharedHandlers = {
              onPointerMove: moveMaskDrag,
              onPointerUp: finishMaskDrag,
              onPointerCancel: finishMaskDrag,
            };
            return (
              <g className={selected ? "is-selected" : ""} key={mask.id}>
                {selected && (
                  <>
                    <line className="gradient-boundary" x1={start.x - perpendicularX} x2={start.x + perpendicularX} y1={start.y - perpendicularY} y2={start.y + perpendicularY} />
                    <line className="gradient-boundary gradient-boundary-end" x1={end.x - perpendicularX} x2={end.x + perpendicularX} y1={end.y - perpendicularY} y2={end.y + perpendicularY} />
                  </>
                )}
                <line
                  {...sharedHandlers}
                  className="gradient-axis-hit"
                  data-testid={`gradient-line-${mask.id}`}
                  onPointerDown={(event) => startMaskDrag(event, mask, "move")}
                  x1={start.x}
                  x2={end.x}
                  y1={start.y}
                  y2={end.y}
                />
                <line
                  className={`gradient-axis ${selected ? "is-selected" : ""}`}
                  x1={start.x}
                  x2={end.x}
                  y1={start.y}
                  y2={end.y}
                />
                {selected && (
                  <>
                    <circle
                      {...sharedHandlers}
                      className="gradient-handle"
                      data-testid="gradient-handle-start"
                      onPointerDown={(event) => startMaskDrag(event, mask, "start")}
                      cx={start.x}
                      cy={start.y}
                      r="6"
                    />
                    <circle
                      {...sharedHandlers}
                      className="gradient-handle gradient-handle-end"
                      data-testid="gradient-handle-end"
                      onPointerDown={(event) => startMaskDrag(event, mask, "end")}
                      cx={end.x}
                      cy={end.y}
                      r="6"
                    />
                  </>
                )}
              </g>
            );
          })}
        </svg>
      )}

      {imageTopLeft && (
        <div
          className="photo-name-label"
          data-testid="canvas-photo-name"
          style={{ left: imageTopLeft.x, top: imageTopLeft.y }}
          title={photo.name}
        >
          {photo.name}
        </div>
      )}

      {maskToolMode !== "idle" && (
        <div className="mask-tool-badge">
          Drag on photo to draw {maskToolMode === "create-linear" ? "linear" : "radial"} gradient · Esc to cancel
        </div>
      )}
      {!ready && !error && (
        <div className="absolute inset-0 grid place-items-center text-xs text-zinc-500">
          <span className="loading-shimmer">Preparing GPU preview…</span>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 grid place-items-center p-8 text-center">
          <div>
            <p className="text-sm font-medium text-red-200">Preview unavailable</p>
            <p className="mt-2 max-w-sm text-xs leading-5 text-zinc-500">{error}</p>
          </div>
        </div>
      )}
      <div className="canvas-tools">
        <Button aria-label="Fit photo" onClick={fit} size="iconSm" title="Fit photo" variant="secondary"><Focus className="size-3.5" /></Button>
        <Button aria-label="View at 100%" onClick={actual} size="iconSm" title="View at 100%" variant="secondary"><Maximize2 className="size-3.5" /></Button>
        <span className="flex min-w-12 items-center gap-1 px-1.5 text-[10px] tabular-nums text-zinc-500"><ZoomIn className="size-3" /> {zoom}%</span>
      </div>
      {showOriginal && <div className="before-badge">ORIGINAL</div>}
      <div className="photo-metadata-pill">
        <span>{photo.width} × {photo.height}</span><span className="text-zinc-600">·</span><span>{photo.mimeType === "image/png" ? "PNG" : "JPEG"}</span>
      </div>
    </div>
  );
}
