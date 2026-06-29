import { z } from "zod";
import { ProjectVisibility } from "@prisma/client";

const visibility = z.nativeEnum(ProjectVisibility);

const urlOrEmpty = z.union([z.string().url().max(500), z.literal(""), z.null()]);
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const exampleItem = z.object({
  title: z.string().min(1).max(200),
  url: z.string().url().max(500).optional(),
  description: z.string().max(2000).optional(),
});

export const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  visibility: visibility.optional(),
  teamIds: z.array(z.string()).optional(),
  startDate: dateString.optional(),
  deadline: dateString.optional(),
  clientRequirements: z.string().max(50000).optional(),
  examplesJson: z.array(exampleItem).optional(),
  figmaUrl: urlOrEmpty.optional(),
  githubUrl: urlOrEmpty.optional(),
  liveUrl: urlOrEmpty.optional(),
  docsUrl: urlOrEmpty.optional(),
}).refine((d) => {
  if (!d.startDate || !d.deadline) return true;
  return new Date(d.deadline) >= new Date(d.startDate);
}, {
  message: "deadline must be on or after startDate",
  path: ["deadline"],
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.union([z.string().max(5000), z.null()]).optional(),
  visibility: visibility.optional(),
  startDate: dateString.optional(),
  deadline: dateString.optional(),
  clientRequirements: z.union([z.string().max(50000), z.null()]).optional(),
  examplesJson: z.union([z.array(exampleItem), z.null()]).optional(),
  figmaUrl: urlOrEmpty.optional(),
  githubUrl: urlOrEmpty.optional(),
  liveUrl: urlOrEmpty.optional(),
  docsUrl: urlOrEmpty.optional(),
});
