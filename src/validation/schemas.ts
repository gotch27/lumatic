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
  startX: z.number().finite().min(0).max(1),
  startY: z.number().finite().min(0).max(1),
  endX: z.number().finite().min(0).max(1),
  endY: z.number().finite().min(0).max(1),
  feather: z.number().finite().min(0).max(1),
});

export const maskAdjustmentCommandSchema = adjustmentCommandSchema.extend({
  maskId: z.string().min(1),
});

export const supportedImageSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["image/jpeg", "image/png"]),
  size: z.number().positive(),
});
