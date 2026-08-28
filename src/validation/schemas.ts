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
  points: z.array(z.object({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
  })).min(2).max(16).superRefine((points, context) => {
    for (let index = 1; index < points.length; index += 1) {
      if (points[index].x <= points[index - 1].x) {
        context.addIssue({ code: "custom", message: "Tone curve points must be ordered by input." });
        break;
      }
    }
  }),
  actor: z.enum(["user", "agent"]).default("user"),
});

export const supportedImageSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["image/jpeg", "image/png"]),
  size: z.number().positive(),
});
