import type { PhotoEditState } from "@/editor/domain/types";

export const BRUSH_ATLAS_COLUMNS = 4;
export const BRUSH_ATLAS_ROWS = 2;
export const PREVIEW_BRUSH_CELL_SIZE = 512;
export const EXPORT_BRUSH_CELL_SIZE = 1024;

export function createBrushAtlasCanvas(cellSize: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = cellSize * BRUSH_ATLAS_COLUMNS;
  canvas.height = cellSize * BRUSH_ATLAS_ROWS;
  return canvas;
}

export function renderBrushMaskAtlas(
  canvas: HTMLCanvasElement,
  editState: PhotoEditState,
  imageWidth: number,
  imageHeight: number,
): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const cellSize = canvas.width / BRUSH_ATLAS_COLUMNS;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#000";
  context.fillRect(0, 0, canvas.width, canvas.height);

  editState.masks.forEach((mask, index) => {
    if (mask.type !== "brush") return;
    const column = index % BRUSH_ATLAS_COLUMNS;
    const row = Math.floor(index / BRUSH_ATLAS_COLUMNS);
    const offsetX = column * cellSize;
    const offsetY = row * cellSize;
    context.save();
    context.beginPath();
    context.rect(offsetX, offsetY, cellSize, cellSize);
    context.clip();

    for (const stroke of mask.strokes) {
      context.globalCompositeOperation = stroke.mode === "erase" ? "destination-out" : "source-over";
      const radiusInPixels = stroke.size * Math.min(imageWidth, imageHeight) * 0.5;
      const radiusX = Math.max(0.5, (radiusInPixels / imageWidth) * cellSize);
      const radiusY = Math.max(0.5, (radiusInPixels / imageHeight) * cellSize);
      const hardEdge = Math.min(0.999, Math.max(0, 1 - stroke.feather));
      const alpha = Math.min(1, Math.max(0.01, stroke.flow));

      for (const point of stroke.points) {
        context.save();
        context.translate(offsetX + point.x * cellSize, offsetY + point.y * cellSize);
        context.scale(radiusX, radiusY);
        const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1);
        gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
        gradient.addColorStop(hardEdge, `rgba(255,255,255,${alpha})`);
        gradient.addColorStop(1, "rgba(255,255,255,0)");
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(0, 0, 1, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
    }
    context.restore();
  });
  context.globalCompositeOperation = "source-over";
}
