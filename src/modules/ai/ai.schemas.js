import { z } from "zod";

export const generateSchemaSchema = z.object({
  description: z.string().min(10).max(4000),
  clearExisting: z.boolean().optional(),
});
