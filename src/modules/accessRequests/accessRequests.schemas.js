import { z } from "zod";
import { AccessRequestStatus, ProjectMemberRole } from "@prisma/client";

export const createAccessRequestSchema = z.object({
  requestedRole: z.nativeEnum(ProjectMemberRole).refine((r) => r !== ProjectMemberRole.LEADER, {
    message: "Cannot request leader role",
  }).optional(),
  message: z.string().max(2000).optional(),
});

export const reviewAccessRequestSchema = z.object({
  status: z.enum([AccessRequestStatus.APPROVED, AccessRequestStatus.DENIED]),
});
