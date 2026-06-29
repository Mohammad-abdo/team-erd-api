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

const deploymentAccessItem = z.object({
  id: z.string().min(1).max(64),
  type: z.enum([
    "BACKEND_API",
    "FRONTEND_LIVE",
    "ADMIN_PANEL",
    "FRONTEND_ADMIN",
    "STAGING",
    "OTHER",
  ]),
  label: z.string().min(1).max(200),
  url: z.union([z.string().url().max(500), z.literal(""), z.null()]).optional(),
  environment: z.enum(["production", "staging", "development"]).optional(),
  username: z.union([z.string().max(200), z.literal(""), z.null()]).optional(),
  password: z.union([z.string().max(500), z.literal(""), z.null()]).optional(),
  email: z.union([z.string().email().max(200), z.literal(""), z.null()]).optional(),
  role: z.union([z.string().max(100), z.literal(""), z.null()]).optional(),
  notes: z.union([z.string().max(2000), z.literal(""), z.null()]).optional(),
});

export const deploymentAccessJsonSchema = z.array(deploymentAccessItem).max(50);

export const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  visibility: visibility.optional(),
  teamIds: z.array(z.string()).optional(),
  startDate: dateString.optional(),
  deadline: dateString.optional(),
  clientRequirements: z.string().max(50000).optional(),
  examplesJson: z.array(exampleItem).optional(),
  deploymentAccessJson: deploymentAccessJsonSchema.optional(),
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
  deploymentAccessJson: z.union([deploymentAccessJsonSchema, z.null()]).optional(),
  figmaUrl: urlOrEmpty.optional(),
  githubUrl: urlOrEmpty.optional(),
  liveUrl: urlOrEmpty.optional(),
  docsUrl: urlOrEmpty.optional(),
});
