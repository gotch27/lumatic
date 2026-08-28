import { Application, Sprite, Texture } from "pixi.js";

import type { RuntimePhoto } from "@/editor/domain/types";
import { getGeometryOutputDimensions, getOrientedDimensions } from "@/editor/domain/geometry";
import {
  createAdjustmentFilter,
  destroyAdjustmentFilter,
  setFilterImageRegion,
  setFilterImageSprite,
  setFilterImageSize,
} from "@/editor/renderer/adjustmentShader";
import { EXPORT_BRUSH_CELL_SIZE } from "@/editor/renderer/brushMaskAtlas";
import { getOriginalAsset } from "@/editor/persistence/repository";

const TILE_EDGE = 4088;
const FILTER_PADDING = 4;

function canvasToBlob(canvas: HTMLCanvasElement, photo: RuntimePhoto): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The browser could not encode the edited photo."))),
      photo.mimeType,
      photo.mimeType === "image/jpeg" ? 0.95 : undefined,
    );
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function editedFilename(photo: RuntimePhoto): string {
  const extension = photo.mimeType === "image/png" ? "png" : "jpg";
  const base = photo.name.replace(/\.[^.]+$/, "");
  return `${base}-edited.${extension}`;
}

export interface ExportOptions {
  signal?: AbortSignal;
  onProgress?: (progress: number, label: string) => void;
}

export async function exportPhoto(photo: RuntimePhoto, options: ExportOptions = {}): Promise<void> {
  const original = await getOriginalAsset(photo.id);
  const adjusted = document.createElement("canvas");
  adjusted.width = photo.width;
  adjusted.height = photo.height;
  const adjustedContext = adjusted.getContext("2d", { alpha: photo.mimeType === "image/png" });
  if (!adjustedContext) throw new Error("A full-resolution export canvas could not be created.");
  if (photo.mimeType === "image/jpeg") {
    adjustedContext.fillStyle = "#000";
    adjustedContext.fillRect(0, 0, adjusted.width, adjusted.height);
  }

  const columns = Math.ceil(photo.width / TILE_EDGE);
  const rows = Math.ceil(photo.height / TILE_EDGE);
  const totalTiles = columns * rows;
  const application = new Application();
  await application.init({
    preference: "webgl",
    width: Math.min(TILE_EDGE, photo.width),
    height: Math.min(TILE_EDGE, photo.height),
    backgroundAlpha: photo.mimeType === "image/png" ? 0 : 1,
    backgroundColor: 0x000000,
    resolution: 1,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  const filter = createAdjustmentFilter(photo.editState, EXPORT_BRUSH_CELL_SIZE);
  setFilterImageSize(filter, photo.width, photo.height);

  try {
    let completed = 0;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        if (options.signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
        const x = column * TILE_EDGE;
        const y = row * TILE_EDGE;
        const width = Math.min(TILE_EDGE, photo.width - x);
        const height = Math.min(TILE_EDGE, photo.height - y);
        options.onProgress?.(completed / totalTiles, `Rendering tile ${completed + 1} of ${totalTiles}`);

        const sourceX = Math.max(0, x - FILTER_PADDING);
        const sourceY = Math.max(0, y - FILTER_PADDING);
        const sourceRight = Math.min(photo.width, x + width + FILTER_PADDING);
        const sourceBottom = Math.min(photo.height, y + height + FILTER_PADDING);
        const sourceWidth = sourceRight - sourceX;
        const sourceHeight = sourceBottom - sourceY;
        const cropX = x - sourceX;
        const cropY = y - sourceY;
        const bitmap = await createImageBitmap(original, sourceX, sourceY, sourceWidth, sourceHeight);
        const texture = Texture.from(bitmap);
        const sprite = new Sprite(texture);
        sprite.filters = [filter];
        setFilterImageSprite(filter, sprite);
        setFilterImageRegion(
          filter,
          sourceX / photo.width,
          sourceY / photo.height,
          sourceWidth / photo.width,
          sourceHeight / photo.height,
        );
        application.renderer.resize(sourceWidth, sourceHeight);
        application.stage.addChild(sprite);
        application.render();
        adjustedContext.drawImage(application.canvas, cropX, cropY, width, height, x, y, width, height);
        application.stage.removeChild(sprite);
        sprite.destroy();
        texture.destroy(true);
        bitmap.close();

        completed += 1;
        options.onProgress?.(completed / totalTiles, `Rendered ${completed} of ${totalTiles} tiles`);
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    }
    options.onProgress?.(0.98, "Applying crop & geometry");
    const dimensions = getGeometryOutputDimensions(photo.width, photo.height, photo.editState.geometry);
    const oriented = getOrientedDimensions(photo.width, photo.height, photo.editState.geometry.rotation);
    const output = document.createElement("canvas");
    output.width = dimensions.width;
    output.height = dimensions.height;
    const outputContext = output.getContext("2d", { alpha: photo.mimeType === "image/png" });
    if (!outputContext) throw new Error("The cropped export canvas could not be created.");
    if (photo.mimeType === "image/jpeg") {
      outputContext.fillStyle = "#000";
      outputContext.fillRect(0, 0, output.width, output.height);
    }
    const geometry = photo.editState.geometry;
    const cropCenterX = geometry.crop.x + geometry.crop.width / 2;
    const cropCenterY = geometry.crop.y + geometry.crop.height / 2;
    outputContext.save();
    outputContext.translate(output.width / 2, output.height / 2);
    outputContext.translate(
      -(cropCenterX - 0.5) * oriented.width,
      -(cropCenterY - 0.5) * oriented.height,
    );
    outputContext.rotate(geometry.straighten * Math.PI / 180);
    outputContext.scale(geometry.flipHorizontal ? -1 : 1, geometry.flipVertical ? -1 : 1);
    outputContext.rotate(geometry.rotation * Math.PI / 180);
    outputContext.drawImage(adjusted, -photo.width / 2, -photo.height / 2);
    outputContext.restore();

    options.onProgress?.(1, "Encoding full-resolution image");
    const blob = await canvasToBlob(output, photo);
    downloadBlob(blob, editedFilename(photo));
  } finally {
    destroyAdjustmentFilter(filter);
    application.destroy({ removeView: true }, { children: true });
  }
}
