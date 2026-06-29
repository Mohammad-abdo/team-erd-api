import { z } from "zod";

export const teamAssistantSchema = z.object({
  message: z.string().min(1).max(4000),
  teamId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
});
