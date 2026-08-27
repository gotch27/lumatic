"use client";

import { Focus, Maximize2, ZoomIn } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { DEFAULT_ADJUSTMENTS } from "@/editor/domain/adjustments";
import type { RuntimePhoto } from "@/editor/domain/types";
import { PhotoRenderer } from "@/editor/renderer/PhotoRenderer";

export default function PhotoCanvas({ photo, showOriginal }: { photo: RuntimePhoto; showOriginal: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<PhotoRenderer | null>(null);
  const draggingRef = useRef<{ x: number; y: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = new PhotoRenderer();
    rendererRef.current = renderer;
    let active = true;
    renderer
      .mount(host, photo.editState.adjustments)
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
    renderer.setPhoto(photo.previewUrl).then(() => setZoom(renderer.getZoomPercent())).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "The photo preview could not be displayed.");
    });
  }, [photo.id, photo.previewUrl, ready]);

  useEffect(() => {
    rendererRef.current?.setAdjustments(showOriginal ? DEFAULT_ADJUSTMENTS : photo.editState.adjustments);
  }, [photo.editState.adjustments, showOriginal]);

  const fit = () => {
    rendererRef.current?.fit();
    setZoom(rendererRef.current?.getZoomPercent() ?? 100);
  };
  const actual = () => {
    rendererRef.current?.actualSize();
    setZoom(100);
  };

  return (
    <div className="photo-stage" data-testid="photo-stage">
      <div
        className="photo-canvas-host"
        onPointerDown={(event) => {
          draggingRef.current = { x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = draggingRef.current;
          if (!drag) return;
          rendererRef.current?.panBy(event.clientX - drag.x, event.clientY - drag.y);
          draggingRef.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          draggingRef.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onWheel={(event) => {
          event.preventDefault();
          const bounds = event.currentTarget.getBoundingClientRect();
          rendererRef.current?.zoomAt(event.deltaY, event.clientX - bounds.left, event.clientY - bounds.top);
          setZoom(rendererRef.current?.getZoomPercent() ?? zoom);
        }}
        ref={hostRef}
      />
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
        <Button aria-label="Fit photo" onClick={fit} size="iconSm" title="Fit photo" variant="secondary">
          <Focus className="size-3.5" />
        </Button>
        <Button aria-label="View at 100%" onClick={actual} size="iconSm" title="View at 100%" variant="secondary">
          <Maximize2 className="size-3.5" />
        </Button>
        <span className="flex min-w-12 items-center gap-1 px-1.5 text-[10px] tabular-nums text-zinc-500">
          <ZoomIn className="size-3" /> {zoom}%
        </span>
      </div>
      {showOriginal && <div className="before-badge">ORIGINAL</div>}
      <div className="photo-metadata-pill">
        <span>{photo.width} × {photo.height}</span>
        <span className="text-zinc-600">·</span>
        <span>{photo.mimeType === "image/png" ? "PNG" : "JPEG"}</span>
      </div>
    </div>
  );
}
