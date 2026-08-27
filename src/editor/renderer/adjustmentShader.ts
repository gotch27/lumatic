import { Filter, GlProgram } from "pixi.js";

import type { AdjustmentValues } from "@/editor/domain/types";

const vertex = `
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

const fragment = `
  in vec2 vTextureCoord;
  uniform sampler2D uTexture;
  uniform float uExposure;
  uniform float uContrast;
  uniform float uHighlights;
  uniform float uShadows;
  uniform float uWhites;
  uniform float uBlacks;
  uniform float uTemperature;
  uniform float uTint;
  uniform float uSaturation;
  uniform float uVibrance;

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

  void main(void) {
    vec4 source = texture2D(uTexture, vTextureCoord);
    vec3 color = srgbToLinear(source.rgb);

    float temperature = uTemperature / 100.0;
    float tint = uTint / 100.0;
    color *= vec3(
      1.0 + temperature * 0.20 + tint * 0.035,
      1.0 - tint * 0.10,
      1.0 - temperature * 0.20 + tint * 0.035
    );
    color *= pow(2.0, uExposure);

    float luma = luminance(color);
    float shadowWeight = 1.0 - smoothstep(0.10, 0.62, luma);
    float highlightWeight = smoothstep(0.38, 0.92, luma);
    float blackWeight = 1.0 - smoothstep(0.02, 0.28, luma);
    float whiteWeight = smoothstep(0.72, 1.0, luma);

    color += vec3((uShadows / 100.0) * 0.30 * shadowWeight);
    color += vec3((uHighlights / 100.0) * 0.30 * highlightWeight);
    color += vec3((uBlacks / 100.0) * 0.18 * blackWeight);
    color += vec3((uWhites / 100.0) * 0.18 * whiteWeight);

    float contrastFactor = 1.0 + (uContrast / 100.0) * 0.85;
    color = (color - vec3(0.18)) * contrastFactor + vec3(0.18);

    luma = luminance(color);
    float saturationFactor = max(0.0, 1.0 + uSaturation / 100.0);
    color = mix(vec3(luma), color, saturationFactor);
    float chroma = max(color.r, max(color.g, color.b)) - min(color.r, min(color.g, color.b));
    float vibranceFactor = 1.0 + (uVibrance / 100.0) * (1.0 - clamp(chroma, 0.0, 1.0)) * 0.9;
    color = mix(vec3(luminance(color)), color, max(0.0, vibranceFactor));

    gl_FragColor = vec4(clamp(linearToSrgb(color), 0.0, 1.0), source.a);
  }
`;

export type AdjustmentFilter = Filter & {
  resources: {
    adjustmentUniforms: {
      uniforms: Record<string, number>;
    };
  };
};

export function createAdjustmentFilter(adjustments: AdjustmentValues): AdjustmentFilter {
  return new Filter({
    glProgram: new GlProgram({ vertex, fragment }),
    resources: {
      adjustmentUniforms: {
        uExposure: { value: adjustments.exposure, type: "f32" },
        uContrast: { value: adjustments.contrast, type: "f32" },
        uHighlights: { value: adjustments.highlights, type: "f32" },
        uShadows: { value: adjustments.shadows, type: "f32" },
        uWhites: { value: adjustments.whites, type: "f32" },
        uBlacks: { value: adjustments.blacks, type: "f32" },
        uTemperature: { value: adjustments.temperature, type: "f32" },
        uTint: { value: adjustments.tint, type: "f32" },
        uSaturation: { value: adjustments.saturation, type: "f32" },
        uVibrance: { value: adjustments.vibrance, type: "f32" },
      },
    },
  }) as AdjustmentFilter;
}

export function setFilterAdjustments(filter: AdjustmentFilter, adjustments: AdjustmentValues): void {
  const uniforms = filter.resources.adjustmentUniforms.uniforms;
  uniforms.uExposure = adjustments.exposure;
  uniforms.uContrast = adjustments.contrast;
  uniforms.uHighlights = adjustments.highlights;
  uniforms.uShadows = adjustments.shadows;
  uniforms.uWhites = adjustments.whites;
  uniforms.uBlacks = adjustments.blacks;
  uniforms.uTemperature = adjustments.temperature;
  uniforms.uTint = adjustments.tint;
  uniforms.uSaturation = adjustments.saturation;
  uniforms.uVibrance = adjustments.vibrance;
}
