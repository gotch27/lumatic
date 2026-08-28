"use client";

import { Triangle } from "lucide-react";
import { useMemo, useState } from "react";

import { histogramPath } from "@/editor/imaging/histogram";
import { useEditorStore } from "@/editor/state/store";

export function HistogramPanel({ photoId }: { photoId: string }) {
  const histogram = useEditorStore((state) => state.histogramPhotoId === photoId ? state.histogram : null);
  const showShadowClipping = useEditorStore((state) => state.showShadowClipping);
  const showHighlightClipping = useEditorStore((state) => state.showHighlightClipping);
  const [mode, setMode] = useState<"rgb" | "luminance">("rgb");
  const paths = useMemo(() => {
    if (!histogram) return null;
    const rgbMaximum = Math.max(1, ...histogram.red, ...histogram.green, ...histogram.blue);
    return {
      red: histogramPath(histogram.red, 256, 72, rgbMaximum),
      green: histogramPath(histogram.green, 256, 72, rgbMaximum),
      blue: histogramPath(histogram.blue, 256, 72, rgbMaximum),
      luminance: histogramPath(histogram.luminance),
    };
  }, [histogram]);
  const hasShadowClipping = Boolean(histogram?.shadowClipped);
  const hasHighlightClipping = Boolean(histogram?.highlightClipped);

  return (
    <section aria-label="Histogram" className="histogram-panel" data-testid="histogram-panel">
      <div className="histogram-heading">
        <span>Histogram</span>
        <div aria-label="Histogram channel" className="histogram-mode" role="group">
          <button aria-pressed={mode === "rgb"} className={mode === "rgb" ? "is-active" : ""} onClick={() => setMode("rgb")} type="button">RGB</button>
          <button aria-pressed={mode === "luminance"} className={mode === "luminance" ? "is-active" : ""} onClick={() => setMode("luminance")} type="button">Luma</button>
        </div>
      </div>
      <div className="histogram-graph">
        {paths ? (
          <svg aria-label={`${mode === "rgb" ? "RGB" : "Luminance"} histogram`} preserveAspectRatio="none" role="img" viewBox="0 0 256 72">
            {mode === "rgb" ? (
              <>
                <path className="histogram-red" d={paths.red} />
                <path className="histogram-green" d={paths.green} />
                <path className="histogram-blue" d={paths.blue} />
              </>
            ) : <path className="histogram-luminance" d={paths.luminance} />}
          </svg>
        ) : <div className="histogram-loading" />}
        <button
          aria-label="Toggle shadow clipping overlay"
          aria-pressed={showShadowClipping}
          className={`histogram-clipping histogram-clipping-shadow ${hasShadowClipping ? "has-clipping" : ""} ${showShadowClipping ? "is-active" : ""}`}
          data-testid="shadow-clipping-toggle"
          onClick={() => useEditorStore.setState({ showShadowClipping: !showShadowClipping })}
          title="Show clipped shadows on the image"
          type="button"
        >
          <Triangle className="size-3" />
        </button>
        <button
          aria-label="Toggle highlight clipping overlay"
          aria-pressed={showHighlightClipping}
          className={`histogram-clipping histogram-clipping-highlight ${hasHighlightClipping ? "has-clipping" : ""} ${showHighlightClipping ? "is-active" : ""}`}
          data-testid="highlight-clipping-toggle"
          onClick={() => useEditorStore.setState({ showHighlightClipping: !showHighlightClipping })}
          title="Show clipped highlights on the image"
          type="button"
        >
          <Triangle className="size-3" />
        </button>
      </div>
    </section>
  );
}
