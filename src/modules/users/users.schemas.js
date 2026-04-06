import { z } from "zod";

export const patchMeSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  avatar: z.union([z.string().url().max(2048), z.literal(""), z.null()]).optional(),
});
