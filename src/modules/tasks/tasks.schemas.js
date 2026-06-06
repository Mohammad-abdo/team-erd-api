import { z } from "zod";
import { TaskPriority, TaskStatus } from "@prisma/client";

export const createTaskSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  progress: z.coerce.number().int().min(0).max(100).optional(),
  dueDate: z.string().datetime().optional().nullable(),
  assigneeIds: z.array(z.string().min(1)).max(20).optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).optional().nullable(),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  progress: z.coerce.number().int().min(0).max(100).optional(),
  dueDate: z.string().datetime().optional().nullable(),
  sortOrder: z.coerce.number().int().optional(),
  assigneeIds: z.array(z.string().min(1)).max(20).optional(),
});

export const logProgressSchema = z.object({
  progress: z.coerce.number().int().min(0).max(100),
  note: z.string().max(2000).optional(),
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
