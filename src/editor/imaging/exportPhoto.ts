import { Application, Sprite, Texture } from "pixi.js";

import type { RuntimePhoto } from "@/editor/domain/types";
import { createAdjustmentFilter, setFilterImageRegion } from "@/editor/renderer/adjustmentShader";
import { getOriginalAsset } from "@/editor/persistence/repository";

const TILE_EDGE = 4096;

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
  const output = document.createElement("canvas");
  output.width = photo.width;
  output.height = photo.height;
  const outputContext = output.getContext("2d", { alpha: photo.mimeType === "image/png" });
  if (!outputContext) throw new Error("A full-resolution export canvas could not be created.");
  if (photo.mimeType === "image/jpeg") {
    outputContext.fillStyle = "#000";
    outputContext.fillRect(0, 0, output.width, output.height);
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
  const filter = createAdjustmentFilter(photo.editState);

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

        const bitmap = await createImageBitmap(original, x, y, width, height);
        const texture = Texture.from(bitmap);
        const sprite = new Sprite(texture);
        sprite.filters = [filter];
        setFilterImageRegion(
          filter,
          x / photo.width,
          y / photo.height,
          width / photo.width,
          height / photo.height,
        );
        application.renderer.resize(width, height);
        application.stage.addChild(sprite);
        application.render();
        outputContext.drawImage(application.canvas, 0, 0, width, height, x, y, width, height);
        application.stage.removeChild(sprite);
        sprite.destroy();
        texture.destroy(true);
        bitmap.close();

        completed += 1;
        options.onProgress?.(completed / totalTiles, `Rendered ${completed} of ${totalTiles} tiles`);
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    }
    options.onProgress?.(1, "Encoding full-resolution image");
    const blob = await canvasToBlob(output, photo);
    downloadBlob(blob, editedFilename(photo));
  } finally {
    application.destroy({ removeView: true }, { children: true });
  }
}
