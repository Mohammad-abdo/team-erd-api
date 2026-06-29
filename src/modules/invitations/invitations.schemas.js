import { z } from "zod";

export const acceptInvitationSchema = z.object({
  token: z.string().min(16),
});

export const previewInvitationQuerySchema = z.object({
  token: z.string().min(16),
});

export const registerInvitationSchema = z.object({
  token: z.string().min(16),
  name: z.string().min(1).max(200),
  password: z.string().min(8).max(128),
});
