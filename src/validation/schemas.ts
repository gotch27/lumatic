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

export const supportedImageSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["image/jpeg", "image/png"]),
  size: z.number().positive(),
});
