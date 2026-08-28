export const HISTOGRAM_BIN_COUNT = 256;

export interface HistogramData {
  red: number[];
  green: number[];
  blue: number[];
  luminance: number[];
  sampleCount: number;
  shadowClipped: number;
  highlightClipped: number;
}

function emptyBins(): number[] {
  return Array.from({ length: HISTOGRAM_BIN_COUNT }, () => 0);
}

export function createEmptyHistogram(): HistogramData {
  return {
    red: emptyBins(),
    green: emptyBins(),
    blue: emptyBins(),
    luminance: emptyBins(),
    sampleCount: 0,
    shadowClipped: 0,
    highlightClipped: 0,
  };
}

export function calculateHistogram(pixels: Uint8ClampedArray): HistogramData {
  const histogram = createEmptyHistogram();
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    if (alpha === 0) continue;
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const luminance = Math.min(255, Math.max(0, Math.round(red * 0.2126 + green * 0.7152 + blue * 0.0722)));
    histogram.red[red] += 1;
    histogram.green[green] += 1;
    histogram.blue[blue] += 1;
    histogram.luminance[luminance] += 1;
    histogram.sampleCount += 1;
    if (Math.max(red, green, blue) <= 2) histogram.shadowClipped += 1;
    if (Math.max(red, green, blue) >= 253) histogram.highlightClipped += 1;
  }
  return histogram;
}

export function histogramPath(bins: number[], width = 256, height = 72, sharedMaximum?: number): string {
  const maximum = Math.max(1, sharedMaximum ?? Math.max(...bins));
  const points = bins.map((count, index) => {
    const x = (index / (bins.length - 1)) * width;
    const y = height - Math.sqrt(count / maximum) * height;
    return `${x.toFixed(2)} ${y.toFixed(2)}`;
  });
  return `M 0 ${height} L ${points.join(" L ")} L ${width} ${height} Z`;
}
