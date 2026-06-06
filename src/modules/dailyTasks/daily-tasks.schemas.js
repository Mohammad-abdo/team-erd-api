import { z } from "zod";
import { TaskPriority, TaskStatus } from "@prisma/client";

export const createDailyTaskSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  taskDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  assigneeId: z.string().min(1).optional(),
});

export const updateDailyTaskSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(2000).optional().nullable(),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  taskDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  assigneeId: z.string().min(1).optional(),
});
