import type { PhotoAssetRecord, PhotoRecord, RuntimePhoto } from "@/editor/domain/types";
import { createDefaultAdjustments } from "@/editor/domain/adjustments";
import { supportedImageSchema } from "@/validation/schemas";
import { createId } from "@/lib/id";

const PREVIEW_LONG_EDGE = 1600;
const THUMBNAIL_LONG_EDGE = 240;

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: "image/jpeg" | "image/png",
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The browser could not create an image preview."))),
      type,
      quality,
    );
  });
}

async function createVariant(
  bitmap: ImageBitmap,
  longEdge: number,
  mimeType: "image/jpeg" | "image/png",
): Promise<Blob> {
  const scale = Math.min(1, longEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: mimeType === "image/png" });
  if (!context) throw new Error("Canvas rendering is not available in this browser.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  return canvasToBlob(canvas, mimeType, mimeType === "image/jpeg" ? 0.88 : undefined);
}

export interface ProcessedImage {
  photo: PhotoRecord;
  assets: PhotoAssetRecord;
}

export async function processImageFile(file: File, order: number): Promise<ProcessedImage> {
  const parsed = supportedImageSchema.safeParse({ name: file.name, type: file.type, size: file.size });
  if (!parsed.success) {
    throw new Error(`${file.name} is not a supported JPEG or PNG image.`);
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`${file.name} could not be decoded and may be damaged.`);
  }

  try {
    const id = createId();
    const now = Date.now();
    const mimeType = parsed.data.type;
    const [preview, thumbnail] = await Promise.all([
      createVariant(bitmap, PREVIEW_LONG_EDGE, mimeType),
      createVariant(bitmap, THUMBNAIL_LONG_EDGE, mimeType),
    ]);

    return {
      photo: {
        id,
        order,
        name: file.name,
        mimeType,
        size: file.size,
        width: bitmap.width,
        height: bitmap.height,
        createdAt: now,
        updatedAt: now,
        editState: { adjustments: createDefaultAdjustments() },
        historyCursor: 0,
      },
      assets: { photoId: id, original: file, preview, thumbnail },
    };
  } finally {
    bitmap.close();
  }
}

export function createRuntimePhoto(photo: PhotoRecord, assets: PhotoAssetRecord): RuntimePhoto {
  return {
    ...photo,
    editState: { adjustments: { ...photo.editState.adjustments } },
    previewUrl: URL.createObjectURL(assets.preview),
    thumbnailUrl: URL.createObjectURL(assets.thumbnail),
  };
}

export function revokePhotoUrls(photo: RuntimePhoto): void {
  URL.revokeObjectURL(photo.previewUrl);
  URL.revokeObjectURL(photo.thumbnailUrl);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
