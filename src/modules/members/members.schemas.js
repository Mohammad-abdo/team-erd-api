import { z } from "zod";
import { DailyReportScope } from "@prisma/client";

export const createRatingSchema = z.object({
  score: z.coerce.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
  teamId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
});

export const createReportSchema = z.object({
  summary: z.string().min(1).max(5000),
  tasksDone: z.string().max(3000).optional(),
  blockers: z.string().max(2000).optional(),
  nextPlan: z.string().max(2000).optional(),
  hoursWorked: z.coerce.number().min(0).max(24).optional(),
  mood: z.coerce.number().int().min(1).max(5).optional(),
  teamId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  scope: z.nativeEnum(DailyReportScope).optional(),
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const assignProjectSchema = z.object({
  projectId: z.string().min(1),
  role: z.enum(["LEADER", "EDITOR", "VIEWER", "COMMENTER"]).optional(),
});
