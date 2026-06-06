import { z } from "zod";

export const createSnapshotSchema = z.object({
  label: z.string().min(1).max(200).optional(),
});
