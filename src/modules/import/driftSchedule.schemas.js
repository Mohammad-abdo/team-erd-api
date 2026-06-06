import { z } from "zod";

export const driftScheduleUpsertSchema = z.object({
  profileId: z.string().min(1),
  enabled: z.boolean().optional(),
  utcDay: z.coerce.number().int().min(0).max(6).optional(),
  utcHour: z.coerce.number().int().min(0).max(23).optional(),
});
