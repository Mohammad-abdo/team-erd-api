import { z } from "zod";
import { TeamRole } from "@prisma/client";

export const createTeamSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  color: z.string().max(32).optional(),
  icon: z.string().max(32).nullable().optional(),
  parentTeamId: z.string().min(1).nullable().optional(),
});

export const updateTeamSchema = createTeamSchema.partial();

export const addMemberSchema = z.object({
  userId: z.string().min(1),
  role: z.nativeEnum(TeamRole).optional(),
});

export const updateTeamMemberRoleSchema = z.object({
  role: z.nativeEnum(TeamRole),
});

export const assignProjectSchema = z.object({
  projectId: z.string().min(1),
});
