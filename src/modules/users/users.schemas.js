import { z } from "zod";

const notificationPrefsSchema = z.object({
  schemaChange: z.boolean().optional(),
  schemaDrift: z.boolean().optional(),
  commentMention: z.boolean().optional(),
  commentReply: z.boolean().optional(),
  taskAssigned: z.boolean().optional(),
  dailyTaskAssigned: z.boolean().optional(),
  projectInvite: z.boolean().optional(),
  projectAdded: z.boolean().optional(),
});

export const patchMeSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  avatar: z.union([z.string().url().max(2048), z.literal(""), z.null()]).optional(),
  notificationPrefs: notificationPrefsSchema.optional(),
});
