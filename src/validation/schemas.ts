import { z } from "zod";

export const adjustmentKeySchema = z.enum([
  "exposure",
  "contrast",
  "highlights",
  "shadows",
  "whites",
  "blacks",
  "temperature",
  "tint",
  "saturation",
  "vibrance",
]);

export const adjustmentCommandSchema = z.object({
  photoId: z.string().min(1),
  key: adjustmentKeySchema,
  value: z.number().finite(),
  actor: z.enum(["user", "agent"]).default("user"),
});

export const linearGradientGeometrySchema = z.object({
  startX: z.number().finite(),
  startY: z.number().finite(),
  endX: z.number().finite(),
  endY: z.number().finite(),
  feather: z.number().finite().min(0).max(1),
});

export const maskAdjustmentCommandSchema = adjustmentCommandSchema.extend({
  maskId: z.string().min(1),
});

export const developSettingCommandSchema = z.object({
  photoId: z.string().min(1),
  target: z.string().min(1),
  value: z.number().finite(),
  actor: z.enum(["user", "agent"]).default("user"),
});

export const toneCurveCommandSchema = z.object({
  photoId: z.string().min(1),
  channel: z.enum(["rgb", "red", "green", "blue"]),
  values: z.array(z.number().finite().min(0).max(1)).length(5),
  actor: z.enum(["user", "agent"]).default("user"),
});

export const supportedImageSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["image/jpeg", "image/png"]),
  size: z.number().positive(),
});
