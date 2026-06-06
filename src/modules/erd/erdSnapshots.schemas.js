import { z } from "zod";

export const createSnapshotSchema = z.object({
  label: z.string().min(1).max(200).optional(),
});

export const diffSnapshotsQuerySchema = z.object({
  base: z.string().min(1),
  target: z.string().min(1),
});
