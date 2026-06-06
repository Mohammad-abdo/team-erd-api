import { z } from "zod";

export const createTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  erdJson: z.record(z.unknown()).optional(),
  apiJson: z.record(z.unknown()).optional(),
  isPublic: z.boolean().optional(),
});

export const updateTemplateSchema = createTemplateSchema.partial();

export const createFromProjectSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});
