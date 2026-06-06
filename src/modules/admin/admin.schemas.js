import { z } from "zod";
import { PlatformRole, ProjectMemberRole, TeamRole } from "@prisma/client";

export const createUserSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  platformRole: z.nativeEnum(PlatformRole).optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
  platformRole: z.nativeEnum(PlatformRole).optional(),
  password: z.string().min(8).max(128).optional(),
});

export const assignTeamSchema = z.object({
  teamId: z.string().min(1),
  role: z.nativeEnum(TeamRole).optional(),
});

const clientAccessSchema = z.object({
  overview: z.boolean().optional(),
  erd: z.boolean().optional(),
  api: z.boolean().optional(),
  report: z.boolean().optional(),
  tasks: z.boolean().optional(),
  comments: z.boolean().optional(),
  activity: z.boolean().optional(),
  health: z.boolean().optional(),
});

export const assignProjectSchema = z.object({
  projectId: z.string().min(1),
  role: z
    .nativeEnum(ProjectMemberRole)
    .refine((r) => r !== ProjectMemberRole.LEADER, { message: "Cannot assign as leader" })
    .optional(),
  clientAccess: clientAccessSchema.optional(),
});

export const updateClientAccessSchema = clientAccessSchema;

export const testEmailSchema = z.object({
  to: z.string().email().max(255),
});
