import type { CropRect, GeometryValues, QuarterRotation } from "./types";

export type CropAspectPreset = "free" | "original" | "1:1" | "4:3" | "3:2" | "16:9";

export const DEFAULT_CROP: CropRect = { x: 0, y: 0, width: 1, height: 1 };
export const DEFAULT_GEOMETRY: GeometryValues = {
  crop: DEFAULT_CROP,
  rotation: 0,
  straighten: 0,
  flipHorizontal: false,
  flipVertical: false,
};

const MIN_CROP_SIZE = 0.02;

function round(value: number): number {
  return Number(value.toFixed(5));
}

export function createDefaultGeometry(): GeometryValues {
  return { ...DEFAULT_GEOMETRY, crop: { ...DEFAULT_CROP } };
}

export function cloneGeometry(geometry: GeometryValues): GeometryValues {
  return { ...geometry, crop: { ...geometry.crop } };
}

export function getOrientedDimensions(width: number, height: number, rotation: QuarterRotation) {
  return rotation === 90 || rotation === 270
    ? { width: height, height: width }
    : { width, height };
}

function largestAxisAlignedRect(width: number, height: number, angleRadians: number) {
  const sin = Math.abs(Math.sin(angleRadians));
  const cos = Math.abs(Math.cos(angleRadians));
  if (sin < 0.000001) return { width, height };
  const widthIsLonger = width >= height;
  const longSide = widthIsLonger ? width : height;
  const shortSide = widthIsLonger ? height : width;
  let resultWidth: number;
  let resultHeight: number;
  if (shortSide <= 2 * sin * cos * longSide || Math.abs(sin - cos) < 0.000001) {
    const halfShort = shortSide / 2;
    if (widthIsLonger) {
      resultWidth = halfShort / sin;
      resultHeight = halfShort / cos;
    } else {
      resultWidth = halfShort / cos;
      resultHeight = halfShort / sin;
    }
  } else {
    const cosDouble = cos * cos - sin * sin;
    resultWidth = (width * cos - height * sin) / cosDouble;
    resultHeight = (height * cos - width * sin) / cosDouble;
  }
  return {
    width: Math.min(width, Math.abs(resultWidth)),
    height: Math.min(height, Math.abs(resultHeight)),
  };
}

export function getSafeCropBounds(
  imageWidth: number,
  imageHeight: number,
  geometry: Pick<GeometryValues, "rotation" | "straighten">,
): CropRect {
  const oriented = getOrientedDimensions(imageWidth, imageHeight, geometry.rotation);
  const safe = largestAxisAlignedRect(oriented.width, oriented.height, geometry.straighten * Math.PI / 180);
  const width = Math.min(1, safe.width / oriented.width);
  const height = Math.min(1, safe.height / oriented.height);
  return {
    x: round((1 - width) / 2),
    y: round((1 - height) / 2),
    width: round(width),
    height: round(height),
  };
}

export function clampCropRect(crop: CropRect, bounds: CropRect = DEFAULT_CROP): CropRect {
  const width = Math.min(bounds.width, Math.max(MIN_CROP_SIZE, crop.width));
  const height = Math.min(bounds.height, Math.max(MIN_CROP_SIZE, crop.height));
  const x = Math.min(bounds.x + bounds.width - width, Math.max(bounds.x, crop.x));
  const y = Math.min(bounds.y + bounds.height - height, Math.max(bounds.y, crop.y));
  return { x: round(x), y: round(y), width: round(width), height: round(height) };
}

export function normalizeGeometry(
  geometry: Partial<GeometryValues> | undefined,
  imageWidth = 1,
  imageHeight = 1,
): GeometryValues {
  const rotation = ([0, 90, 180, 270].includes(geometry?.rotation ?? 0)
    ? geometry?.rotation ?? 0
    : 0) as QuarterRotation;
  const straighten = round(Math.min(45, Math.max(-45, geometry?.straighten ?? 0)));
  const next: GeometryValues = {
    crop: { ...DEFAULT_CROP, ...(geometry?.crop ?? {}) },
    rotation,
    straighten,
    flipHorizontal: geometry?.flipHorizontal === true,
    flipVertical: geometry?.flipVertical === true,
  };
  next.crop = clampCropRect(next.crop, getSafeCropBounds(imageWidth, imageHeight, next));
  return next;
}

export function isGeometryEdited(geometry: GeometryValues): boolean {
  return geometry.rotation !== 0
    || geometry.straighten !== 0
    || geometry.flipHorizontal
    || geometry.flipVertical
    || Math.abs(geometry.crop.x) > 0.00001
    || Math.abs(geometry.crop.y) > 0.00001
    || Math.abs(geometry.crop.width - 1) > 0.00001
    || Math.abs(geometry.crop.height - 1) > 0.00001;
}

export function rotateGeometryClockwise(geometry: GeometryValues): GeometryValues {
  const crop = geometry.crop;
  return {
    ...cloneGeometry(geometry),
    rotation: ((geometry.rotation + 90) % 360) as QuarterRotation,
    crop: {
      x: round(1 - crop.y - crop.height),
      y: round(crop.x),
      width: round(crop.height),
      height: round(crop.width),
    },
  };
}

export function applyCropAspectPreset(
  geometry: GeometryValues,
  preset: CropAspectPreset,
  imageWidth: number,
  imageHeight: number,
): GeometryValues {
  if (preset === "free") return cloneGeometry(geometry);
  const oriented = getOrientedDimensions(imageWidth, imageHeight, geometry.rotation);
  const targetAspect = preset === "original"
    ? oriented.width / oriented.height
    : ({ "1:1": 1, "4:3": 4 / 3, "3:2": 3 / 2, "16:9": 16 / 9 } as const)[preset];
  const normalizedRatio = targetAspect * oriented.height / oriented.width;
  const bounds = getSafeCropBounds(imageWidth, imageHeight, geometry);
  let width = bounds.width;
  let height = width / normalizedRatio;
  if (height > bounds.height) {
    height = bounds.height;
    width = height * normalizedRatio;
  }
  return {
    ...cloneGeometry(geometry),
    crop: {
      x: round(bounds.x + (bounds.width - width) / 2),
      y: round(bounds.y + (bounds.height - height) / 2),
      width: round(width),
      height: round(height),
    },
  };
}

export function sourcePointToGeometry(
  point: { x: number; y: number },
  geometry: GeometryValues,
  imageWidth: number,
  imageHeight: number,
) {
  const oriented = geometry.rotation === 90
    ? { x: 1 - point.y, y: point.x }
    : geometry.rotation === 180
      ? { x: 1 - point.x, y: 1 - point.y }
      : geometry.rotation === 270
        ? { x: point.y, y: 1 - point.x }
        : { ...point };
  if (geometry.flipHorizontal) oriented.x = 1 - oriented.x;
  if (geometry.flipVertical) oriented.y = 1 - oriented.y;
  const dimensions = getOrientedDimensions(imageWidth, imageHeight, geometry.rotation);
  const radians = geometry.straighten * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const pixelX = (oriented.x - 0.5) * dimensions.width;
  const pixelY = (oriented.y - 0.5) * dimensions.height;
  return {
    x: (pixelX * cos - pixelY * sin) / dimensions.width + 0.5,
    y: (pixelX * sin + pixelY * cos) / dimensions.height + 0.5,
  };
}

export function geometryPointToSource(
  point: { x: number; y: number },
  geometry: GeometryValues,
  imageWidth: number,
  imageHeight: number,
) {
  const dimensions = getOrientedDimensions(imageWidth, imageHeight, geometry.rotation);
  const radians = -geometry.straighten * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const pixelX = (point.x - 0.5) * dimensions.width;
  const pixelY = (point.y - 0.5) * dimensions.height;
  const oriented = {
    x: (pixelX * cos - pixelY * sin) / dimensions.width + 0.5,
    y: (pixelX * sin + pixelY * cos) / dimensions.height + 0.5,
  };
  if (geometry.flipVertical) oriented.y = 1 - oriented.y;
  if (geometry.flipHorizontal) oriented.x = 1 - oriented.x;
  return geometry.rotation === 90
    ? { x: oriented.y, y: 1 - oriented.x }
    : geometry.rotation === 180
      ? { x: 1 - oriented.x, y: 1 - oriented.y }
      : geometry.rotation === 270
        ? { x: 1 - oriented.y, y: oriented.x }
        : oriented;
}

export function getGeometryOutputDimensions(imageWidth: number, imageHeight: number, geometry: GeometryValues) {
  const oriented = getOrientedDimensions(imageWidth, imageHeight, geometry.rotation);
  return {
    width: Math.max(1, Math.round(oriented.width * geometry.crop.width)),
    height: Math.max(1, Math.round(oriented.height * geometry.crop.height)),
  };
}
