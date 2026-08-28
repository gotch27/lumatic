import { Filter, GlProgram, Matrix, type Sprite } from "pixi.js";

import { MAX_LINEAR_GRADIENTS } from "@/editor/domain/masks";
import {
  COLOR_GRADE_RANGES,
  COLOR_MIX_CHANNELS,
  CURVE_CHANNELS,
  MAX_TONE_CURVE_POINTS,
} from "@/editor/domain/developSettings";
import type { AdjustmentValues, PhotoEditState } from "@/editor/domain/types";

const vertex = `
  precision highp float;
  in vec2 aPosition;
  out vec2 vTextureCoord;
  out vec2 vImageUv;
  uniform vec4 uInputSize;
  uniform vec4 uOutputFrame;
  uniform vec4 uOutputTexture;
  uniform mat3 uImageMatrix;

  vec4 filterVertexPosition(void) {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
  }

  vec2 filterTextureCoord(void) {
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
  }

  void main(void) {
    vec2 textureCoord = filterTextureCoord();
    gl_Position = filterVertexPosition();
    vTextureCoord = textureCoord;
    vImageUv = (uImageMatrix * vec3(textureCoord, 1.0)).xy;
  }
`;

const adjustmentNames = [
  "Exposure",
  "Contrast",
  "Highlights",
  "Shadows",
  "Whites",
  "Blacks",
  "Temperature",
  "Tint",
  "Saturation",
  "Vibrance",
] as const;

function adjustmentUniformDeclarations(prefix: string): string {
  return adjustmentNames.map((name) => `uniform float ${prefix}${name};`).join("\n");
}

function adjustmentArguments(prefix: string): string {
  return adjustmentNames.map((name) => `${prefix}${name}`).join(", ");
}

const maskUniforms = Array.from({ length: MAX_LINEAR_GRADIENTS }, (_, index) => `
  uniform float uMask${index}Active;
  uniform float uMask${index}StartX;
  uniform float uMask${index}StartY;
  uniform float uMask${index}EndX;
  uniform float uMask${index}EndY;
  uniform float uMask${index}Feather;
  ${adjustmentUniformDeclarations(`uMask${index}`)}
`).join("\n");

const maskApplications = Array.from({ length: MAX_LINEAR_GRADIENTS }, (_, index) => `
    float maskWeight${index} = uMask${index}Active * linearGradientWeight(
      imageUv,
      vec2(uMask${index}StartX, uMask${index}StartY),
      vec2(uMask${index}EndX, uMask${index}EndY),
      uMask${index}Feather
    );
    vec3 maskColor${index} = applyAdjustments(color, ${adjustmentArguments(`uMask${index}`)});
    color = mix(color, maskColor${index}, clamp(maskWeight${index}, 0.0, 1.0));
`).join("\n");

const curveUniforms = CURVE_CHANNELS.map(({ key }) => {
  const name = key[0].toUpperCase() + key.slice(1);
  return [
    `uniform float uCurve${name}Count;`,
    ...Array.from({ length: MAX_TONE_CURVE_POINTS }, (_, index) => (
      `uniform float uCurve${name}X${index}; uniform float uCurve${name}Y${index};`
    )),
  ].join("\n");
}).join("\n");

const curveFunctionParameters = [
  "float value",
  "float pointCount",
  ...Array.from({ length: MAX_TONE_CURVE_POINTS }, (_, index) => `float x${index}, float y${index}`),
].join(", ");

const curveArguments = (channel: string) => [
  `uCurve${channel}Count`,
  ...Array.from({ length: MAX_TONE_CURVE_POINTS }, (_, index) => (
    `uCurve${channel}X${index}, uCurve${channel}Y${index}`
  )),
].join(", ");

const curveSegments = Array.from({ length: MAX_TONE_CURVE_POINTS - 1 }, (_, offset) => {
  const index = offset + 1;
  return `
    if (pointCount > ${index.toFixed(1)}) {
      float span${index} = max(0.0001, x${index} - x${index - 1});
      if (inputValue <= x${index}) {
        float progress${index} = clamp((inputValue - x${index - 1}) / span${index}, 0.0, 1.0);
        return mix(y${index - 1}, y${index}, progress${index});
      }
      result = y${index};
    }
  `;
}).join("\n");

const curveFunction = `
  float applyCurve(${curveFunctionParameters}) {
    float inputValue = clamp(value, 0.0, 1.0);
    if (pointCount < 1.5) return inputValue;
    float result = y0;
    if (inputValue <= x0) return result;
    ${curveSegments}
    return result;
  }
`;

const colorMixUniforms = COLOR_MIX_CHANNELS.map(({ key }) => {
  const name = key[0].toUpperCase() + key.slice(1);
  return `uniform float uMix${name}Hue; uniform float uMix${name}Saturation; uniform float uMix${name}Luminance;`;
}).join("\n");

const colorMixApplications = COLOR_MIX_CHANNELS.map(({ key }, index) => {
  const name = key[0].toUpperCase() + key.slice(1);
  const centers = [0, 1 / 12, 1 / 6, 1 / 3, 0.5, 2 / 3, 5 / 6, 11 / 12];
  return `
    float mixWeight${index} = hueWeight(hsl.x, ${centers[index].toFixed(6)});
    hueShift += mixWeight${index} * uMix${name}Hue;
    saturationShift += mixWeight${index} * uMix${name}Saturation;
    luminanceShift += mixWeight${index} * uMix${name}Luminance;
  `;
}).join("\n");

const gradeUniforms = COLOR_GRADE_RANGES.map(({ key }) => {
  const name = key[0].toUpperCase() + key.slice(1);
  return `uniform float uGrade${name}Hue; uniform float uGrade${name}Saturation; uniform float uGrade${name}Luminance;`;
}).join("\n");

const fragment = `
  precision highp float;
  in vec2 vTextureCoord;
  in vec2 vImageUv;
  out vec4 finalColor;
  uniform sampler2D uTexture;
  ${adjustmentUniformDeclarations("u")}
  uniform float uImageUvOffsetX;
  uniform float uImageUvOffsetY;
  uniform float uImageUvScaleX;
  uniform float uImageUvScaleY;
  uniform float uImageWidth;
  uniform float uImageHeight;
  uniform highp vec4 uInputPixel;
  uniform float uToneCurvesActive;
  ${curveUniforms}
  ${colorMixUniforms}
  ${gradeUniforms}
  uniform float uGradeBlending;
  uniform float uGradeBalance;
  uniform float uTextureAmount;
  uniform float uClarity;
  uniform float uDehaze;
  uniform float uVignette;
  uniform float uVignetteMidpoint;
  uniform float uVignetteRoundness;
  uniform float uVignetteFeather;
  uniform float uGrain;
  uniform float uGrainSize;
  uniform float uGrainRoughness;
  uniform float uSharpening;
  uniform float uSharpeningRadius;
  uniform float uSharpeningDetail;
  uniform float uSharpeningMasking;
  uniform float uLuminanceNoise;
  uniform float uLuminanceDetail;
  uniform float uLuminanceContrast;
  uniform float uColorNoise;
  uniform float uColorNoiseDetail;
  uniform float uColorNoiseSmoothness;
  ${maskUniforms}

  vec3 srgbToLinear(vec3 value) {
    vec3 lower = value / 12.92;
    vec3 upper = pow((value + 0.055) / 1.055, vec3(2.4));
    return mix(lower, upper, step(vec3(0.04045), value));
  }

  vec3 linearToSrgb(vec3 value) {
    value = max(value, vec3(0.0));
    vec3 lower = value * 12.92;
    vec3 upper = 1.055 * pow(value, vec3(1.0 / 2.4)) - 0.055;
    return mix(lower, upper, step(vec3(0.0031308), value));
  }

  float luminance(vec3 value) {
    return dot(value, vec3(0.2126, 0.7152, 0.0722));
  }

  ${curveFunction}

  vec3 applyToneCurves(vec3 color) {
    if (uToneCurvesActive < 0.5) return color;
    color = vec3(
      applyCurve(color.r, ${curveArguments("Rgb")}),
      applyCurve(color.g, ${curveArguments("Rgb")}),
      applyCurve(color.b, ${curveArguments("Rgb")})
    );
    return vec3(
      applyCurve(color.r, ${curveArguments("Red")}),
      applyCurve(color.g, ${curveArguments("Green")}),
      applyCurve(color.b, ${curveArguments("Blue")})
    );
  }

  vec3 rgbToHsl(vec3 color) {
    float maxValue = max(color.r, max(color.g, color.b));
    float minValue = min(color.r, min(color.g, color.b));
    float delta = maxValue - minValue;
    float hue = 0.0;
    if (delta > 0.00001) {
      if (maxValue == color.r) hue = mod((color.g - color.b) / delta, 6.0);
      else if (maxValue == color.g) hue = ((color.b - color.r) / delta) + 2.0;
      else hue = ((color.r - color.g) / delta) + 4.0;
      hue /= 6.0;
      if (hue < 0.0) hue += 1.0;
    }
    float lightness = (maxValue + minValue) * 0.5;
    float saturationValue = delta < 0.00001 ? 0.0 : delta / (1.0 - abs(2.0 * lightness - 1.0));
    return vec3(hue, saturationValue, lightness);
  }

  float hueToRgb(float p, float q, float t) {
    t = fract(t);
    if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
    if (t < 0.5) return q;
    if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
    return p;
  }

  vec3 hslToRgb(vec3 hsl) {
    if (hsl.y < 0.00001) return vec3(hsl.z);
    float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
    float p = 2.0 * hsl.z - q;
    return vec3(
      hueToRgb(p, q, hsl.x + 1.0 / 3.0),
      hueToRgb(p, q, hsl.x),
      hueToRgb(p, q, hsl.x - 1.0 / 3.0)
    );
  }

  float hueWeight(float hue, float center) {
    float distanceValue = abs(hue - center);
    distanceValue = min(distanceValue, 1.0 - distanceValue);
    return 1.0 - smoothstep(0.045, 0.14, distanceValue);
  }

  vec3 applyColorMix(vec3 color) {
    vec3 hsl = rgbToHsl(clamp(color, 0.0, 1.0));
    float hueShift = 0.0;
    float saturationShift = 0.0;
    float luminanceShift = 0.0;
    ${colorMixApplications}
    hsl.x = fract(hsl.x + (hueShift / 100.0) * 0.083333);
    hsl.y = clamp(hsl.y * (1.0 + saturationShift / 100.0), 0.0, 1.0);
    hsl.z = clamp(hsl.z + (luminanceShift / 100.0) * 0.35, 0.0, 1.0);
    return hslToRgb(hsl);
  }

  vec3 applyGrade(vec3 color, float hue, float saturationValue, float luminanceValue, float weight) {
    float amount = clamp(saturationValue / 100.0, 0.0, 1.0) * weight;
    float luma = luminance(color);
    vec3 tint = hslToRgb(vec3(fract(hue / 360.0), 0.82, clamp(luma, 0.0, 1.0)));
    color = mix(color, tint, amount * 0.72);
    return color + vec3((luminanceValue / 100.0) * 0.24 * weight);
  }

  vec3 applyColorGrading(vec3 color) {
    color = applyGrade(color, uGradeGlobalHue, uGradeGlobalSaturation, uGradeGlobalLuminance, 1.0);
    float luma = luminance(color);
    float blend = mix(0.08, 0.32, uGradeBlending / 100.0);
    float balance = (uGradeBalance / 100.0) * 0.24;
    float shadowWeight = 1.0 - smoothstep(0.30 + balance - blend, 0.30 + balance + blend, luma);
    float highlightWeight = smoothstep(0.70 + balance - blend, 0.70 + balance + blend, luma);
    float midtoneWeight = clamp(1.0 - max(shadowWeight, highlightWeight), 0.0, 1.0);
    color = applyGrade(color, uGradeShadowsHue, uGradeShadowsSaturation, uGradeShadowsLuminance, shadowWeight);
    color = applyGrade(color, uGradeMidtonesHue, uGradeMidtonesSaturation, uGradeMidtonesLuminance, midtoneWeight);
    return applyGrade(color, uGradeHighlightsHue, uGradeHighlightsSaturation, uGradeHighlightsLuminance, highlightWeight);
  }

  float randomValue(vec2 coordinate) {
    return fract(sin(dot(coordinate, vec2(12.9898, 78.233))) * 43758.5453);
  }

  vec3 applyAdjustments(
    vec3 color,
    float exposure,
    float contrast,
    float highlights,
    float shadows,
    float whites,
    float blacks,
    float temperatureValue,
    float tint,
    float saturation,
    float vibrance
  ) {
    float temperature = temperatureValue / 100.0;
    float tintValue = tint / 100.0;
    color *= vec3(
      1.0 + temperature * 0.20 + tintValue * 0.035,
      1.0 - tintValue * 0.10,
      1.0 - temperature * 0.20 + tintValue * 0.035
    );
    color *= pow(2.0, exposure);

    float luma = luminance(color);
    float shadowWeight = 1.0 - smoothstep(0.10, 0.62, luma);
    float highlightWeight = smoothstep(0.38, 0.92, luma);
    float blackWeight = 1.0 - smoothstep(0.02, 0.28, luma);
    float whiteWeight = smoothstep(0.72, 1.0, luma);
    color += vec3((shadows / 100.0) * 0.30 * shadowWeight);
    color += vec3((highlights / 100.0) * 0.30 * highlightWeight);
    color += vec3((blacks / 100.0) * 0.18 * blackWeight);
    color += vec3((whites / 100.0) * 0.18 * whiteWeight);

    float contrastFactor = 1.0 + (contrast / 100.0) * 0.85;
    color = (color - vec3(0.18)) * contrastFactor + vec3(0.18);
    luma = luminance(color);
    color = mix(vec3(luma), color, max(0.0, 1.0 + saturation / 100.0));
    float chroma = max(color.r, max(color.g, color.b)) - min(color.r, min(color.g, color.b));
    float vibranceFactor = 1.0 + (vibrance / 100.0) * (1.0 - clamp(chroma, 0.0, 1.0)) * 0.9;
    return mix(vec3(luminance(color)), color, max(0.0, vibranceFactor));
  }

  float linearGradientWeight(vec2 uv, vec2 startPoint, vec2 endPoint, float feather) {
    vec2 imageSize = vec2(uImageWidth, uImageHeight);
    uv *= imageSize;
    startPoint *= imageSize;
    endPoint *= imageSize;
    vec2 direction = endPoint - startPoint;
    float lengthSquared = dot(direction, direction);
    if (lengthSquared < 0.000001) return 0.0;
    float position = dot(uv - startPoint, direction) / lengthSquared;
    float hardTransition = step(0.5, position);
    float softTransition = smoothstep(0.0, 1.0, position);
    return 1.0 - mix(hardTransition, softTransition, clamp(feather, 0.0, 1.0));
  }

  void main(void) {
    vec4 source = texture2D(uTexture, vTextureCoord);
    vec2 sampleStep = uInputPixel.zw * max(0.5, uSharpeningRadius);
    vec3 sourceLinear = srgbToLinear(source.rgb);
    vec3 neighbor = sourceLinear;
    float neighborEffect = max(
      max(abs(uTextureAmount), abs(uClarity)),
      max(max(uSharpening, uLuminanceNoise), uColorNoise)
    );
    if (neighborEffect > 0.0001) {
      neighbor = (
        srgbToLinear(texture2D(uTexture, vTextureCoord + vec2(sampleStep.x, 0.0)).rgb)
        + srgbToLinear(texture2D(uTexture, vTextureCoord - vec2(sampleStep.x, 0.0)).rgb)
        + srgbToLinear(texture2D(uTexture, vTextureCoord + vec2(0.0, sampleStep.y)).rgb)
        + srgbToLinear(texture2D(uTexture, vTextureCoord - vec2(0.0, sampleStep.y)).rgb)
      ) * 0.25;
    }
    float luminanceNoiseAmount = (uLuminanceNoise / 100.0) * mix(0.82, 0.45, uLuminanceDetail / 100.0);
    vec3 color = mix(sourceLinear, neighbor, luminanceNoiseAmount);
    float sourceLuma = luminance(color);
    vec3 sourceChroma = color - vec3(sourceLuma);
    float neighborLuma = luminance(neighbor);
    vec3 neighborChroma = neighbor - vec3(neighborLuma);
    float colorNoiseAmount = (uColorNoise / 100.0) * mix(0.82, 0.48, uColorNoiseDetail / 100.0);
    color = vec3(sourceLuma) + mix(sourceChroma, neighborChroma, colorNoiseAmount * (0.5 + uColorNoiseSmoothness / 200.0));
    color = applyAdjustments(color, ${adjustmentArguments("u")});
    color = applyToneCurves(color);
    color = applyColorMix(color);
    color = applyColorGrading(color);
    vec2 localUv = vImageUv;
    vec2 imageUv = vec2(uImageUvOffsetX, uImageUvOffsetY)
      + localUv * vec2(uImageUvScaleX, uImageUvScaleY);
    ${maskApplications}
    float highPassLuma = abs(luminance(sourceLinear) - luminance(neighbor));
    float edgeMask = smoothstep((uSharpeningMasking / 100.0) * 0.12, 0.20, highPassLuma);
    float sharpenStrength = (uSharpening / 150.0) * mix(0.5, 1.5, uSharpeningDetail / 100.0);
    float textureStrength = uTextureAmount / 100.0;
    color += (sourceLinear - neighbor) * (textureStrength * 0.55 + sharpenStrength * edgeMask);
    float midtoneWeight = 1.0 - abs(clamp(luminance(color), 0.0, 1.0) * 2.0 - 1.0);
    color += vec3((luminance(sourceLinear) - luminance(neighbor)) * (uClarity / 100.0) * 0.72 * midtoneWeight);
    float dehaze = uDehaze / 100.0;
    color = (color - vec3(max(0.0, dehaze) * 0.035)) * (1.0 + dehaze * 0.48);
    color = mix(vec3(luminance(color)), color, max(0.0, 1.0 + dehaze * 0.22));
    vec2 centered = imageUv - vec2(0.5);
    centered.x *= mix(1.45, 0.70, (uVignetteRoundness + 100.0) / 200.0);
    float vignetteDistance = length(centered) * 1.4142;
    float vignetteStart = mix(0.18, 0.78, uVignetteMidpoint / 100.0);
    float vignetteSoftness = mix(0.02, 0.42, uVignetteFeather / 100.0);
    float vignetteMask = smoothstep(vignetteStart, min(1.0, vignetteStart + vignetteSoftness), vignetteDistance);
    color *= 1.0 + vignetteMask * (uVignette / 100.0) * 0.72;
    float grainScale = mix(0.55, 3.6, uGrainSize / 100.0);
    vec2 grainCoordinate = floor(imageUv * vec2(uImageWidth, uImageHeight) / grainScale);
    float grainNoise = randomValue(grainCoordinate) - 0.5;
    float roughNoise = randomValue(grainCoordinate * 0.37 + 19.7) - 0.5;
    grainNoise = mix(grainNoise, grainNoise * 0.6 + roughNoise * 0.8, uGrainRoughness / 100.0);
    color += vec3(grainNoise * (uGrain / 100.0) * 0.18);
    color += vec3((luminance(color) - luminance(neighbor)) * (uLuminanceContrast / 100.0) * (uLuminanceNoise / 100.0) * 0.18);
    finalColor = vec4(clamp(linearToSrgb(color), 0.0, 1.0), source.a);
  }
`;

export type AdjustmentFilter = Filter & {
  imageSprite: Sprite | null;
  resources: {
    adjustmentUniforms: {
      uniforms: Record<string, number>;
    };
    imageUniforms: {
      uniforms: {
        uImageMatrix: Matrix;
      };
    };
  };
};

function defineAdjustmentUniforms(prefix: string, adjustments: AdjustmentValues) {
  return {
    [`${prefix}Exposure`]: { value: adjustments.exposure, type: "f32" },
    [`${prefix}Contrast`]: { value: adjustments.contrast, type: "f32" },
    [`${prefix}Highlights`]: { value: adjustments.highlights, type: "f32" },
    [`${prefix}Shadows`]: { value: adjustments.shadows, type: "f32" },
    [`${prefix}Whites`]: { value: adjustments.whites, type: "f32" },
    [`${prefix}Blacks`]: { value: adjustments.blacks, type: "f32" },
    [`${prefix}Temperature`]: { value: adjustments.temperature, type: "f32" },
    [`${prefix}Tint`]: { value: adjustments.tint, type: "f32" },
    [`${prefix}Saturation`]: { value: adjustments.saturation, type: "f32" },
    [`${prefix}Vibrance`]: { value: adjustments.vibrance, type: "f32" },
  };
}

function setAdjustmentUniforms(uniforms: Record<string, number>, prefix: string, adjustments: AdjustmentValues) {
  uniforms[`${prefix}Exposure`] = adjustments.exposure;
  uniforms[`${prefix}Contrast`] = adjustments.contrast;
  uniforms[`${prefix}Highlights`] = adjustments.highlights;
  uniforms[`${prefix}Shadows`] = adjustments.shadows;
  uniforms[`${prefix}Whites`] = adjustments.whites;
  uniforms[`${prefix}Blacks`] = adjustments.blacks;
  uniforms[`${prefix}Temperature`] = adjustments.temperature;
  uniforms[`${prefix}Tint`] = adjustments.tint;
  uniforms[`${prefix}Saturation`] = adjustments.saturation;
  uniforms[`${prefix}Vibrance`] = adjustments.vibrance;
}

function isIdentityCurve(points: PhotoEditState["toneCurve"]["rgb"]): boolean {
  const first = points[0];
  const last = points[points.length - 1];
  return Boolean(
    first
    && last
    && Math.abs(first.x) < 0.000001
    && Math.abs(first.y) < 0.000001
    && Math.abs(last.x - 1) < 0.000001
    && Math.abs(last.y - 1) < 0.000001
    && points.every((point) => Math.abs(point.x - point.y) < 0.000001),
  );
}

function defineDevelopUniforms(editState: PhotoEditState): Record<string, { value: number; type: "f32" }> {
  const resources: Record<string, { value: number; type: "f32" }> = {};
  let toneCurvesActive = false;
  for (const { key } of CURVE_CHANNELS) {
    const name = key[0].toUpperCase() + key.slice(1);
    const points = editState.toneCurve[key];
    const identity = isIdentityCurve(points);
    toneCurvesActive ||= !identity;
    resources[`uCurve${name}Count`] = { value: identity ? 0 : points.length, type: "f32" };
    for (let index = 0; index < MAX_TONE_CURVE_POINTS; index += 1) {
      const point = points[index] ?? points[points.length - 1] ?? { x: 1, y: 1 };
      resources[`uCurve${name}X${index}`] = { value: point.x, type: "f32" };
      resources[`uCurve${name}Y${index}`] = { value: point.y, type: "f32" };
    }
  }
  resources.uToneCurvesActive = { value: toneCurvesActive ? 1 : 0, type: "f32" };
  for (const { key } of COLOR_MIX_CHANNELS) {
    const name = key[0].toUpperCase() + key.slice(1);
    resources[`uMix${name}Hue`] = { value: editState.colorMix[key].hue, type: "f32" };
    resources[`uMix${name}Saturation`] = { value: editState.colorMix[key].saturation, type: "f32" };
    resources[`uMix${name}Luminance`] = { value: editState.colorMix[key].luminance, type: "f32" };
  }
  for (const { key } of COLOR_GRADE_RANGES) {
    const name = key[0].toUpperCase() + key.slice(1);
    resources[`uGrade${name}Hue`] = { value: editState.colorGrading[key].hue, type: "f32" };
    resources[`uGrade${name}Saturation`] = { value: editState.colorGrading[key].saturation, type: "f32" };
    resources[`uGrade${name}Luminance`] = { value: editState.colorGrading[key].luminance, type: "f32" };
  }
  const values: Record<string, number> = {
    uGradeBlending: editState.colorGrading.blending,
    uGradeBalance: editState.colorGrading.balance,
    uTextureAmount: editState.effects.texture,
    uClarity: editState.effects.clarity,
    uDehaze: editState.effects.dehaze,
    uVignette: editState.effects.vignette,
    uVignetteMidpoint: editState.effects.vignetteMidpoint,
    uVignetteRoundness: editState.effects.vignetteRoundness,
    uVignetteFeather: editState.effects.vignetteFeather,
    uGrain: editState.effects.grain,
    uGrainSize: editState.effects.grainSize,
    uGrainRoughness: editState.effects.grainRoughness,
    uSharpening: editState.detail.sharpening,
    uSharpeningRadius: editState.detail.sharpeningRadius,
    uSharpeningDetail: editState.detail.sharpeningDetail,
    uSharpeningMasking: editState.detail.sharpeningMasking,
    uLuminanceNoise: editState.detail.luminanceNoise,
    uLuminanceDetail: editState.detail.luminanceDetail,
    uLuminanceContrast: editState.detail.luminanceContrast,
    uColorNoise: editState.detail.colorNoise,
    uColorNoiseDetail: editState.detail.colorNoiseDetail,
    uColorNoiseSmoothness: editState.detail.colorNoiseSmoothness,
  };
  for (const [key, value] of Object.entries(values)) resources[key] = { value, type: "f32" };
  return resources;
}

function setDevelopUniforms(uniforms: Record<string, number>, editState: PhotoEditState): void {
  const definitions = defineDevelopUniforms(editState);
  for (const [key, definition] of Object.entries(definitions)) uniforms[key] = definition.value;
}

export function createAdjustmentFilter(editState: PhotoEditState): AdjustmentFilter {
  const resources: Record<string, { value: number; type: "f32" }> = {
    ...defineAdjustmentUniforms("u", editState.adjustments),
    ...defineDevelopUniforms(editState),
    uImageUvOffsetX: { value: 0, type: "f32" },
    uImageUvOffsetY: { value: 0, type: "f32" },
    uImageUvScaleX: { value: 1, type: "f32" },
    uImageUvScaleY: { value: 1, type: "f32" },
    uImageWidth: { value: 1, type: "f32" },
    uImageHeight: { value: 1, type: "f32" },
  };
  for (let index = 0; index < MAX_LINEAR_GRADIENTS; index += 1) {
    const mask = editState.masks[index];
    const prefix = `uMask${index}`;
    resources[`${prefix}Active`] = { value: mask ? 1 : 0, type: "f32" };
    resources[`${prefix}StartX`] = { value: mask?.startX ?? 0, type: "f32" };
    resources[`${prefix}StartY`] = { value: mask?.startY ?? 0, type: "f32" };
    resources[`${prefix}EndX`] = { value: mask?.endX ?? 0, type: "f32" };
    resources[`${prefix}EndY`] = { value: mask?.endY ?? 0, type: "f32" };
    resources[`${prefix}Feather`] = { value: mask?.feather ?? 0, type: "f32" };
    Object.assign(resources, defineAdjustmentUniforms(prefix, mask?.adjustments ?? editState.adjustments));
  }
  const filter = new Filter({
    glProgram: GlProgram.from({ vertex, fragment, name: "lumatic-adjustment-filter" }),
    resources: {
      adjustmentUniforms: resources,
      imageUniforms: {
        uImageMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
      },
    },
  }) as AdjustmentFilter;
  filter.imageSprite = null;
  const applyFilter = filter.apply.bind(filter);
  filter.apply = (filterManager, input, output, clearMode) => {
    if (filter.imageSprite) {
      filterManager.calculateSpriteMatrix(
        filter.resources.imageUniforms.uniforms.uImageMatrix,
        filter.imageSprite,
      );
    }
    applyFilter(filterManager, input, output, clearMode);
  };
  return filter;
}

export function setFilterEditState(filter: AdjustmentFilter, editState: PhotoEditState): void {
  const uniforms = filter.resources.adjustmentUniforms.uniforms;
  setAdjustmentUniforms(uniforms, "u", editState.adjustments);
  setDevelopUniforms(uniforms, editState);
  for (let index = 0; index < MAX_LINEAR_GRADIENTS; index += 1) {
    const mask = editState.masks[index];
    const prefix = `uMask${index}`;
    uniforms[`${prefix}Active`] = mask ? 1 : 0;
    uniforms[`${prefix}StartX`] = mask?.startX ?? 0;
    uniforms[`${prefix}StartY`] = mask?.startY ?? 0;
    uniforms[`${prefix}EndX`] = mask?.endX ?? 0;
    uniforms[`${prefix}EndY`] = mask?.endY ?? 0;
    uniforms[`${prefix}Feather`] = mask?.feather ?? 0;
    if (mask) setAdjustmentUniforms(uniforms, prefix, mask.adjustments);
  }
}

export function setFilterImageSize(filter: AdjustmentFilter, width: number, height: number): void {
  const uniforms = filter.resources.adjustmentUniforms.uniforms;
  uniforms.uImageWidth = Math.max(1, width);
  uniforms.uImageHeight = Math.max(1, height);
}

export function setFilterImageSprite(filter: AdjustmentFilter, sprite: Sprite): void {
  filter.imageSprite = sprite;
}

export function setFilterImageRegion(
  filter: AdjustmentFilter,
  offsetX: number,
  offsetY: number,
  scaleX: number,
  scaleY: number,
): void {
  const uniforms = filter.resources.adjustmentUniforms.uniforms;
  uniforms.uImageUvOffsetX = offsetX;
  uniforms.uImageUvOffsetY = offsetY;
  uniforms.uImageUvScaleX = scaleX;
  uniforms.uImageUvScaleY = scaleY;
}
