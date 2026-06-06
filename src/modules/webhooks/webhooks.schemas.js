import { z } from "zod";

const eventEnum = z.enum([
  "*",
  "erd.updated",
  "api.updated",
  "member.updated",
  "comment.updated",
  "project.updated",
  "project.deleted",
]);

export const createWebhookSchema = z.object({
  url: z.string().url().max(500),
  secret: z.string().max(128).optional(),
  events: z.array(eventEnum).min(1).optional(),
  isActive: z.boolean().optional(),
});

export const updateWebhookSchema = createWebhookSchema.partial();
