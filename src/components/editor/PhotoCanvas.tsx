"use client";

import { Focus, Maximize2, ZoomIn } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { Button } from "@/components/ui/button";
import { editorService } from "@/editor/commands/editorService";
import { createDefaultEditState } from "@/editor/domain/adjustments";
import { clampCropRect, cloneGeometry, getGeometryOutputDimensions, getSafeCropBounds } from "@/editor/domain/geometry";
import {
  getGradientGeometry,
  getRadialGradientGeometry,
  type LinearGradientGeometry,
  type RadialGradientGeometry,
} from "@/editor/domain/masks";
import type { BrushPoint, CropRect, EditorMask, LinearGradientMask, RadialGradientMask, RuntimePhoto } from "@/editor/domain/types";
import { calculateHistogram } from "@/editor/imaging/histogram";
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
  angle: number;
  horizontal: { x: number; y: number };
  horizontalOpposite: { x: number; y: number };
  vertical: { x: number; y: number };
  verticalOpposite: { x: number; y: number };
}

type OverlayMask = LinearOverlayMask | RadialOverlayMask;

interface BrushDrag {
  maskId: string;
  strokeId: string;
  lastPoint: BrushPoint;
}

type CropHandle = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

interface CropDrag {
  kind: CropHandle;
  initial: CropRect;
  pointerStart: { x: number; y: number };
}

function latestMask(photoId: string, maskId: string): EditorMask | null {
  const photo = useEditorStore.getState().photos.find((item) => item.id === photoId);
  return photo?.editState.masks.find((mask) => mask.id === maskId) ?? null;
}

export default function PhotoCanvas({ photo, showOriginal }: { photo: RuntimePhoto; showOriginal: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<PhotoRenderer | null>(null);
  const panRef = useRef<{ x: number; y: number } | null>(null);
  const createDragRef = useRef<CreateDrag | null>(null);
  const maskDragRef = useRef<MaskDrag | null>(null);
  const brushDragRef = useRef<BrushDrag | null>(null);
  const cropDragRef = useRef<CropDrag | null>(null);
  const straightenStartRef = useRef<{ x: number; y: number } | null>(null);
  const brushOverlayRef = useRef<HTMLCanvasElement>(null);
  const histogramRevisionRef = useRef(0);
  const histogramInputRef = useRef({ photoId: photo.id, ready: false, renderedPhotoId: null as string | null });
  const maskToolMode = useEditorStore((state) => state.maskToolMode);
  const geometryToolMode = useEditorStore((state) => state.geometryToolMode);
  const selectedMaskId = useEditorStore((state) => state.selectedMaskId);
  const showShadowClipping = useEditorStore((state) => state.showShadowClipping);
  const showHighlightClipping = useEditorStore((state) => state.showHighlightClipping);
  const selectedMask = photo.editState.masks.find((mask) => mask.id === selectedMaskId);
  const selectedBrush = selectedMask?.type === "brush" ? selectedMask : null;
  const [ready, setReady] = useState(false);
  const [renderedPhotoId, setRenderedPhotoId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [transformVersion, setTransformVersion] = useState(0);
  const [overlayMasks, setOverlayMasks] = useState<OverlayMask[]>([]);
  const [brushCursor, setBrushCursor] = useState<{ x: number; y: number; diameter: number } | null>(null);
  const [cropScreenRect, setCropScreenRect] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [straightenLine, setStraightenLine] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);

  const pointFromEvent = (clientX: number, clientY: number) => {
    const host = hostRef.current;
    const renderer = rendererRef.current;
    if (!host || !renderer) return null;
    const bounds = host.getBoundingClientRect();
    return renderer.screenToImage(clientX - bounds.left, clientY - bounds.top);
  };

  const geometryPointFromEvent = (clientX: number, clientY: number) => {
    const host = hostRef.current;
    const renderer = rendererRef.current;
    if (!host || !renderer) return null;
    const bounds = host.getBoundingClientRect();
    return renderer.screenToGeometry(clientX - bounds.left, clientY - bounds.top);
  };

  const screenPointFromEvent = (clientX: number, clientY: number) => {
    const bounds = hostRef.current?.getBoundingClientRect();
    return bounds ? { x: clientX - bounds.left, y: clientY - bounds.top } : null;
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = new PhotoRenderer();
    rendererRef.current = renderer;
    let active = true;
    renderer
      .mount(host, photo.editState, () => {
        if (active) {
          setTransformVersion((version) => version + 1);
          setCropScreenRect(renderer.getCropScreenRect());
          setStageSize({ width: host.clientWidth, height: host.clientHeight });
        }
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
          setRenderedPhotoId(photo.id);
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
      setRenderedPhotoId(photo.id);
      setZoom(renderer.getZoomPercent());
      setTransformVersion((version) => version + 1);
    }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "The photo preview could not be displayed.");
    });
  }, [photo.id, photo.previewUrl, ready]);

  useEffect(() => {
    const editState = showOriginal
      ? { ...createDefaultEditState(), geometry: cloneGeometry(photo.editState.geometry) }
      : photo.editState;
    rendererRef.current?.setEditState(editState);
  }, [photo.editState, showOriginal]);

  useEffect(() => {
    rendererRef.current?.setClippingOverlays(showShadowClipping, showHighlightClipping);
  }, [showHighlightClipping, showShadowClipping]);

  useEffect(() => {
    histogramInputRef.current = { photoId: photo.id, ready, renderedPhotoId };
  }, [photo.id, ready, renderedPhotoId]);

  useEffect(() => {
    histogramRevisionRef.current += 1;
    if (!ready || renderedPhotoId !== photo.id) {
      useEditorStore.setState({ histogramPhotoId: photo.id, histogram: null });
    }
  }, [photo.editState, photo.id, ready, renderedPhotoId, showOriginal]);

  useEffect(() => {
    let lastRevision = -1;
    const analyze = () => {
      const revision = histogramRevisionRef.current;
      if (revision === lastRevision) return;
      const input = histogramInputRef.current;
      if (!input.ready || input.renderedPhotoId !== input.photoId) return;
      try {
        const sample = rendererRef.current?.sampleFinalPixels();
        if (!sample) return;
        useEditorStore.setState({
          histogramPhotoId: input.photoId,
          histogram: calculateHistogram(sample.pixels),
        });
      } catch {
        useEditorStore.setState({ histogramPhotoId: input.photoId, histogram: null });
      }
      lastRevision = revision;
    };
    const timer = window.setInterval(analyze, 100);
    analyze();
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    rendererRef.current?.setGeometryEditing(geometryToolMode !== "idle" && !showOriginal);
  }, [geometryToolMode, showOriginal]);

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
      if (mask.type !== "radial-gradient") return [];
      const center = renderer.imageToScreen(mask.centerX, mask.centerY);
      const horizontal = renderer.imageToScreen(mask.centerX + mask.radiusX, mask.centerY);
      const horizontalOpposite = renderer.imageToScreen(mask.centerX - mask.radiusX, mask.centerY);
      const vertical = renderer.imageToScreen(mask.centerX, mask.centerY + mask.radiusY);
      const verticalOpposite = renderer.imageToScreen(mask.centerX, mask.centerY - mask.radiusY);
      return center && horizontal && horizontalOpposite && vertical && verticalOpposite ? [{
        type: "radial-gradient",
        mask,
        center,
        radiusX: Math.hypot(horizontal.x - center.x, horizontal.y - center.y),
        radiusY: Math.hypot(vertical.x - center.x, vertical.y - center.y),
        angle: Math.atan2(horizontal.y - center.y, horizontal.x - center.x) * 180 / Math.PI,
        horizontal,
        horizontalOpposite,
        vertical,
        verticalOpposite,
      }] : [];
    }));
  }, [photo.editState.masks, showOriginal, transformVersion]);

  useEffect(() => {
    const canvas = brushOverlayRef.current;
    const host = hostRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !host || !renderer) return;
    const width = host.clientWidth;
    const height = host.clientHeight;
    const density = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * density));
    canvas.height = Math.max(1, Math.round(height * density));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const output = canvas.getContext("2d");
    if (!output) return;
    output.setTransform(density, 0, 0, density, 0, 0);
    output.clearRect(0, 0, width, height);
    if (!selectedBrush || showOriginal) return;

    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = canvas.width;
    maskCanvas.height = canvas.height;
    const maskContext = maskCanvas.getContext("2d");
    if (!maskContext) return;
    maskContext.setTransform(density, 0, 0, density, 0, 0);
    const imageStart = renderer.imageToScreen(0, 0);
    const imageHorizontal = renderer.imageToScreen(1, 0);
    const imageVertical = renderer.imageToScreen(0, 1);
    if (!imageStart || !imageHorizontal || !imageVertical) return;
    const displayedShortEdge = Math.min(
      Math.hypot(imageHorizontal.x - imageStart.x, imageHorizontal.y - imageStart.y),
      Math.hypot(imageVertical.x - imageStart.x, imageVertical.y - imageStart.y),
    );

    const crop = renderer.getCropScreenRect();
    output.save();
    output.beginPath();
    output.rect(crop.x, crop.y, crop.width, crop.height);
    output.clip();

    for (const stroke of selectedBrush.strokes) {
      maskContext.globalCompositeOperation = stroke.mode === "erase" ? "destination-out" : "source-over";
      const radius = Math.max(0.5, stroke.size * displayedShortEdge * 0.5);
      const hardEdge = Math.min(0.999, Math.max(0, 1 - stroke.feather));
      for (const point of stroke.points) {
        const screen = renderer.imageToScreen(point.x, point.y);
        if (!screen) continue;
        const gradient = maskContext.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, radius);
        gradient.addColorStop(0, `rgba(255,255,255,${stroke.flow})`);
        gradient.addColorStop(hardEdge, `rgba(255,255,255,${stroke.flow})`);
        gradient.addColorStop(1, "rgba(255,255,255,0)");
        maskContext.fillStyle = gradient;
        maskContext.beginPath();
        maskContext.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
        maskContext.fill();
      }
    }

    if (selectedBrush.inverted) {
      output.fillStyle = "rgba(239,68,68,.28)";
      output.fillRect(crop.x, crop.y, crop.width, crop.height);
      output.globalCompositeOperation = "destination-out";
      output.drawImage(maskCanvas, 0, 0, width, height);
    } else {
      output.drawImage(maskCanvas, 0, 0, width, height);
      output.globalCompositeOperation = "source-in";
      output.fillStyle = "rgba(239,68,68,.38)";
      output.fillRect(0, 0, width, height);
    }
    output.restore();
  }, [photo.editState.masks, selectedBrush, showOriginal, transformVersion]);

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

  const updateBrushCursor = (clientX: number, clientY: number) => {
    const host = hostRef.current;
    const renderer = rendererRef.current;
    if (!host || !renderer || maskToolMode !== "paint-brush" || !selectedBrush) {
      setBrushCursor(null);
      return;
    }
    const bounds = host.getBoundingClientRect();
    const imageStart = renderer.imageToScreen(0, 0);
    const imageHorizontal = renderer.imageToScreen(1, 0);
    const imageVertical = renderer.imageToScreen(0, 1);
    if (!imageStart || !imageHorizontal || !imageVertical) return;
    setBrushCursor({
      x: clientX - bounds.left,
      y: clientY - bounds.top,
      diameter: selectedBrush.size * Math.min(
        Math.hypot(imageHorizontal.x - imageStart.x, imageHorizontal.y - imageStart.y),
        Math.hypot(imageVertical.x - imageStart.x, imageVertical.y - imageStart.y),
      ),
    });
  };

  const startMaskDrag = (
    event: ReactPointerEvent<SVGElement>,
    mask: EditorMask,
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

  const startCropDrag = (event: ReactPointerEvent<SVGElement>, kind: CropHandle) => {
    const point = geometryPointFromEvent(event.clientX, event.clientY);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    cropDragRef.current = {
      kind,
      initial: { ...photo.editState.geometry.crop },
      pointerStart: point,
    };
  };

  const moveCropDrag = (event: ReactPointerEvent<SVGElement>) => {
    const drag = cropDragRef.current;
    const point = geometryPointFromEvent(event.clientX, event.clientY);
    if (!drag || !point) return;
    const bounds = getSafeCropBounds(photo.width, photo.height, photo.editState.geometry);
    const deltaX = point.x - drag.pointerStart.x;
    const deltaY = point.y - drag.pointerStart.y;
    const initial = drag.initial;
    const right = initial.x + initial.width;
    const bottom = initial.y + initial.height;
    let next = { ...initial };
    if (drag.kind === "move") {
      next.x += deltaX;
      next.y += deltaY;
    } else {
      if (drag.kind.includes("w")) {
        next.x = Math.min(right - 0.02, Math.max(bounds.x, initial.x + deltaX));
        next.width = right - next.x;
      }
      if (drag.kind.includes("e")) next.width = Math.max(0.02, initial.width + deltaX);
      if (drag.kind.includes("n")) {
        next.y = Math.min(bottom - 0.02, Math.max(bounds.y, initial.y + deltaY));
        next.height = bottom - next.y;
      }
      if (drag.kind.includes("s")) next.height = Math.max(0.02, initial.height + deltaY);
    }
    next = clampCropRect(next, bounds);
    editorService.previewCrop(photo.id, next);
  };

  const finishCropDrag = (event: ReactPointerEvent<SVGElement>) => {
    if (!cropDragRef.current) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const latest = useEditorStore.getState().photos.find((item) => item.id === photo.id);
    if (latest) editorService.commitCrop(photo.id, latest.editState.geometry.crop);
    cropDragRef.current = null;
    useEditorStore.setState({ geometryToolMode: "crop" });
  };

  const outputDimensions = getGeometryOutputDimensions(photo.width, photo.height, photo.editState.geometry);
  const stageWidth = stageSize.width;
  const stageHeight = stageSize.height;

  return (
    <div className="photo-stage" data-testid="photo-stage">
      <div
        className={`photo-canvas-host ${maskToolMode !== "idle" ? "is-drawing-mask" : ""} ${maskToolMode === "paint-brush" ? "is-painting-brush" : ""} ${geometryToolMode !== "idle" ? "is-editing-geometry" : ""}`}
        onPointerDown={(event) => {
          if (geometryToolMode === "straighten") {
            const point = screenPointFromEvent(event.clientX, event.clientY);
            if (!point) return;
            straightenStartRef.current = point;
            setStraightenLine({ start: point, end: point });
            event.currentTarget.setPointerCapture(event.pointerId);
            return;
          }
          if (geometryToolMode === "crop") return;
          if (maskToolMode === "paint-brush") {
            const point = pointFromEvent(event.clientX, event.clientY);
            if (!point || !selectedBrush) return;
            const strokeId = editorService.beginBrushStroke(photo.id, selectedBrush.id, point);
            if (!strokeId) return;
            brushDragRef.current = { maskId: selectedBrush.id, strokeId, lastPoint: point };
            event.currentTarget.setPointerCapture(event.pointerId);
            return;
          }
          if (maskToolMode === "create-linear" || maskToolMode === "create-radial") {
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
          if (straightenStartRef.current) {
            const point = screenPointFromEvent(event.clientX, event.clientY);
            if (point) setStraightenLine({ start: straightenStartRef.current, end: point });
            return;
          }
          updateBrushCursor(event.clientX, event.clientY);
          const brushDrag = brushDragRef.current;
          if (brushDrag) {
            const point = pointFromEvent(event.clientX, event.clientY);
            const mask = latestMask(photo.id, brushDrag.maskId);
            if (!point || mask?.type !== "brush") return;
            const dx = (point.x - brushDrag.lastPoint.x) * photo.width;
            const dy = (point.y - brushDrag.lastPoint.y) * photo.height;
            const distance = Math.hypot(dx, dy);
            const spacing = Math.max(1, mask.size * Math.min(photo.width, photo.height) * 0.12);
            const steps = Math.max(1, Math.ceil(distance / spacing));
            const points = Array.from({ length: steps }, (_, index) => {
              const progress = (index + 1) / steps;
              return {
                x: brushDrag.lastPoint.x + (point.x - brushDrag.lastPoint.x) * progress,
                y: brushDrag.lastPoint.y + (point.y - brushDrag.lastPoint.y) * progress,
              };
            });
            editorService.previewBrushStroke(photo.id, brushDrag.maskId, brushDrag.strokeId, points);
            brushDrag.lastPoint = point;
            return;
          }
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
          if (straightenStartRef.current) {
            const end = screenPointFromEvent(event.clientX, event.clientY);
            const start = straightenStartRef.current;
            if (end && Math.hypot(end.x - start.x, end.y - start.y) > 8) {
              let angle = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
              if (angle > 90) angle -= 180;
              if (angle < -90) angle += 180;
              editorService.commitStraighten(photo.id, Math.min(45, Math.max(-45, -angle)));
            }
            straightenStartRef.current = null;
            setStraightenLine(null);
          }
          const brushDrag = brushDragRef.current;
          if (brushDrag) {
            editorService.commitBrushStroke(photo.id, brushDrag.maskId);
            brushDragRef.current = null;
          }
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
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerLeave={() => {
          if (!brushDragRef.current) setBrushCursor(null);
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

      {geometryToolMode === "crop" && cropScreenRect.width > 0 && (
        <svg aria-label="Crop overlay" className="crop-overlay" data-testid="crop-overlay">
          <g className="crop-dim">
            <rect x="0" y="0" width={stageWidth} height={Math.max(0, cropScreenRect.y)} />
            <rect x="0" y={cropScreenRect.y + cropScreenRect.height} width={stageWidth} height={Math.max(0, stageHeight - cropScreenRect.y - cropScreenRect.height)} />
            <rect x="0" y={cropScreenRect.y} width={Math.max(0, cropScreenRect.x)} height={cropScreenRect.height} />
            <rect x={cropScreenRect.x + cropScreenRect.width} y={cropScreenRect.y} width={Math.max(0, stageWidth - cropScreenRect.x - cropScreenRect.width)} height={cropScreenRect.height} />
          </g>
          <rect
            className="crop-move-hit"
            data-testid="crop-frame"
            x={cropScreenRect.x}
            y={cropScreenRect.y}
            width={cropScreenRect.width}
            height={cropScreenRect.height}
            onPointerDown={(event) => startCropDrag(event, "move")}
            onPointerMove={moveCropDrag}
            onPointerUp={finishCropDrag}
            onPointerCancel={finishCropDrag}
          />
          <g className="crop-grid">
            <line x1={cropScreenRect.x + cropScreenRect.width / 3} x2={cropScreenRect.x + cropScreenRect.width / 3} y1={cropScreenRect.y} y2={cropScreenRect.y + cropScreenRect.height} />
            <line x1={cropScreenRect.x + cropScreenRect.width * 2 / 3} x2={cropScreenRect.x + cropScreenRect.width * 2 / 3} y1={cropScreenRect.y} y2={cropScreenRect.y + cropScreenRect.height} />
            <line x1={cropScreenRect.x} x2={cropScreenRect.x + cropScreenRect.width} y1={cropScreenRect.y + cropScreenRect.height / 3} y2={cropScreenRect.y + cropScreenRect.height / 3} />
            <line x1={cropScreenRect.x} x2={cropScreenRect.x + cropScreenRect.width} y1={cropScreenRect.y + cropScreenRect.height * 2 / 3} y2={cropScreenRect.y + cropScreenRect.height * 2 / 3} />
          </g>
          <rect className="crop-frame-border" x={cropScreenRect.x} y={cropScreenRect.y} width={cropScreenRect.width} height={cropScreenRect.height} />
          {([
            ["nw", cropScreenRect.x, cropScreenRect.y],
            ["ne", cropScreenRect.x + cropScreenRect.width, cropScreenRect.y],
            ["sw", cropScreenRect.x, cropScreenRect.y + cropScreenRect.height],
            ["se", cropScreenRect.x + cropScreenRect.width, cropScreenRect.y + cropScreenRect.height],
          ] as const).map(([kind, x, y]) => (
            <rect
              className={`crop-handle crop-handle-${kind}`}
              data-testid={`crop-handle-${kind}`}
              height="12"
              key={kind}
              onPointerDown={(event) => startCropDrag(event, kind)}
              onPointerMove={moveCropDrag}
              onPointerUp={finishCropDrag}
              onPointerCancel={finishCropDrag}
              width="12"
              x={x - 6}
              y={y - 6}
            />
          ))}
          {([
            ["n", cropScreenRect.x + cropScreenRect.width / 2, cropScreenRect.y],
            ["s", cropScreenRect.x + cropScreenRect.width / 2, cropScreenRect.y + cropScreenRect.height],
            ["w", cropScreenRect.x, cropScreenRect.y + cropScreenRect.height / 2],
            ["e", cropScreenRect.x + cropScreenRect.width, cropScreenRect.y + cropScreenRect.height / 2],
          ] as const).map(([kind, x, y]) => (
            <circle
              className={`crop-handle crop-handle-${kind}`}
              cx={x}
              cy={y}
              key={kind}
              onPointerDown={(event) => startCropDrag(event, kind)}
              onPointerMove={moveCropDrag}
              onPointerUp={finishCropDrag}
              onPointerCancel={finishCropDrag}
              r="6"
            />
          ))}
        </svg>
      )}

      {straightenLine && (
        <svg aria-hidden="true" className="straighten-overlay">
          <line x1={straightenLine.start.x} y1={straightenLine.start.y} x2={straightenLine.end.x} y2={straightenLine.end.y} />
          <circle cx={straightenLine.start.x} cy={straightenLine.start.y} r="4" />
          <circle cx={straightenLine.end.x} cy={straightenLine.end.y} r="4" />
        </svg>
      )}

      <canvas aria-hidden="true" className="brush-mask-overlay" data-testid="brush-mask-overlay" ref={brushOverlayRef} />
      {brushCursor && maskToolMode === "paint-brush" && (
        <div
          className="brush-cursor"
          data-testid="brush-cursor"
          style={{
            height: Math.max(4, brushCursor.diameter),
            left: brushCursor.x,
            top: brushCursor.y,
            width: Math.max(4, brushCursor.diameter),
          }}
        />
      )}

      {ready && overlayMasks.length > 0 && (
        <svg aria-label="Gradient overlay" className="gradient-overlay" data-testid="gradient-overlay">
          {overlayMasks.map((overlay) => {
            if (overlay.type === "radial-gradient") {
              const { mask, center, radiusX, radiusY, angle, horizontal, horizontalOpposite, vertical, verticalOpposite } = overlay;
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
                    transform={`rotate(${angle} ${center.x} ${center.y})`}
                  />
                  <ellipse
                    className={`radial-boundary ${selected ? "is-selected" : ""}`}
                    cx={center.x}
                    cy={center.y}
                    rx={radiusX}
                    ry={radiusY}
                    transform={`rotate(${angle} ${center.x} ${center.y})`}
                  />
                  {selected && (
                    <>
                      <line className="radial-axis" x1={horizontalOpposite.x} x2={horizontal.x} y1={horizontalOpposite.y} y2={horizontal.y} />
                      <line className="radial-axis" x1={verticalOpposite.x} x2={vertical.x} y1={verticalOpposite.y} y2={vertical.y} />
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
                        cx={horizontal.x}
                        cy={horizontal.y}
                        r="6"
                      />
                      <circle
                        {...sharedHandlers}
                        className="gradient-handle gradient-handle-end"
                        data-testid="radial-gradient-radius-y"
                        onPointerDown={(event) => startMaskDrag(event, mask, "radius-y")}
                        cx={vertical.x}
                        cy={vertical.y}
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

      {cropScreenRect.width > 0 && (
        <div
          className="photo-name-label"
          data-testid="canvas-photo-name"
          style={{ left: cropScreenRect.x, top: cropScreenRect.y }}
          title={photo.name}
        >
          {photo.name}
        </div>
      )}

      {maskToolMode !== "idle" && (
        <div className="mask-tool-badge">
          {maskToolMode === "paint-brush"
            ? "Paint on the photo · [ and ] resize · Esc to stop"
            : `Drag on photo to draw ${maskToolMode === "create-linear" ? "linear" : "radial"} gradient · Esc to cancel`}
        </div>
      )}
      {geometryToolMode === "straighten" && <div className="mask-tool-badge">Drag along a horizon or vertical edge · Esc to cancel</div>}
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
        <span>{outputDimensions.width} × {outputDimensions.height}</span><span className="text-zinc-600">·</span><span>{photo.mimeType === "image/png" ? "PNG" : "JPEG"}</span>
      </div>
    </div>
  );
}
