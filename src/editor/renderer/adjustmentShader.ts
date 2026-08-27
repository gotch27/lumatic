import { Filter, GlProgram } from "pixi.js";

import { MAX_LINEAR_GRADIENTS } from "@/editor/domain/masks";
import type { AdjustmentValues, PhotoEditState } from "@/editor/domain/types";

const vertex = `
  precision highp float;
  in vec2 aPosition;
  out vec2 vTextureCoord;
  uniform vec4 uInputSize;
  uniform vec4 uOutputFrame;
  uniform vec4 uOutputTexture;

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
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
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

const fragment = `
  precision highp float;
  in vec2 vTextureCoord;
  out vec4 finalColor;
  uniform sampler2D uTexture;
  ${adjustmentUniformDeclarations("u")}
  uniform float uImageUvOffsetX;
  uniform float uImageUvOffsetY;
  uniform float uImageUvScaleX;
  uniform float uImageUvScaleY;
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
    vec2 direction = endPoint - startPoint;
    float lengthSquared = dot(direction, direction);
    if (lengthSquared < 0.000001) return 0.0;
    float position = dot(uv - startPoint, direction) / lengthSquared;
    float halfWidth = max(0.02, feather * 0.5);
    return 1.0 - smoothstep(0.5 - halfWidth, 0.5 + halfWidth, position);
  }

  void main(void) {
    vec4 source = texture2D(uTexture, vTextureCoord);
    vec3 color = srgbToLinear(source.rgb);
    color = applyAdjustments(color, ${adjustmentArguments("u")});
    vec2 localUv = vTextureCoord;
    vec2 imageUv = vec2(uImageUvOffsetX, uImageUvOffsetY)
      + localUv * vec2(uImageUvScaleX, uImageUvScaleY);
    ${maskApplications}
    finalColor = vec4(clamp(linearToSrgb(color), 0.0, 1.0), source.a);
  }
`;

export type AdjustmentFilter = Filter & {
  resources: {
    adjustmentUniforms: {
      uniforms: Record<string, number>;
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

export function createAdjustmentFilter(editState: PhotoEditState): AdjustmentFilter {
  const resources: Record<string, { value: number; type: "f32" }> = {
    ...defineAdjustmentUniforms("u", editState.adjustments),
    uImageUvOffsetX: { value: 0, type: "f32" },
    uImageUvOffsetY: { value: 0, type: "f32" },
    uImageUvScaleX: { value: 1, type: "f32" },
    uImageUvScaleY: { value: 1, type: "f32" },
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
  return new Filter({
    glProgram: GlProgram.from({ vertex, fragment, name: "lumatic-adjustment-filter" }),
    resources: { adjustmentUniforms: resources },
  }) as AdjustmentFilter;
}

export function setFilterEditState(filter: AdjustmentFilter, editState: PhotoEditState): void {
  const uniforms = filter.resources.adjustmentUniforms.uniforms;
  setAdjustmentUniforms(uniforms, "u", editState.adjustments);
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
