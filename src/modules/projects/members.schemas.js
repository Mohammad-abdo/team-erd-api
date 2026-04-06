import { z } from "zod";
import { ProjectMemberRole } from "@prisma/client";

const inviteRole = z.nativeEnum(ProjectMemberRole).refine((r) => r !== ProjectMemberRole.LEADER, {
  message: "Cannot invite as leader",
});

export const inviteMemberSchema = z.object({
  email: z.string().email().max(255),
  role: inviteRole,
});

export const updateMemberRoleSchema = z.object({
  role: z.nativeEnum(ProjectMemberRole).refine((r) => r !== ProjectMemberRole.LEADER, {
    message: "Assigning leader role is not supported via this endpoint",
  }),
});
