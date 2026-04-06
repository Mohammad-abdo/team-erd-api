import { z } from "zod";
import { ProjectVisibility } from "@prisma/client";

const visibility = z.nativeEnum(ProjectVisibility);

export const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  visibility: visibility.optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.union([z.string().max(5000), z.null()]).optional(),
  visibility: visibility.optional(),
});
