import { z } from "zod";

export const acceptInvitationSchema = z.object({
  token: z.string().min(16),
});
