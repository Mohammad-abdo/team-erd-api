import { z } from "zod";

export const generateSchemaSchema = z.object({
  description: z.string().min(10).max(4000),
  clearExisting: z.boolean().optional(),
});

export const explainDriftSchema = z.object({
  summary: z.record(z.unknown()),
  issues: z.array(z.record(z.unknown())).max(100).optional(),
  migration: z
    .object({
      sql: z.string().max(80_000).optional(),
      statementCount: z.number().int().optional(),
      dialect: z.string().optional(),
    })
    .optional(),
  meta: z.record(z.unknown()).optional(),
});

export const applyApiRoutesSchema = z.object({
  group: z.object({
    name: z.string().min(1).max(120),
    prefix: z.string().max(120).optional(),
    description: z.string().max(500).optional(),
  }),
  routes: z
    .array(
      z.object({
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
        path: z.string().min(1).max(255),
        summary: z.string().max(500).optional().nullable(),
        erdTableId: z.string().optional().nullable(),
        erdTableName: z.string().optional().nullable(),
      }),
    )
    .min(1)
    .max(200),
  source: z.string().max(40).optional(),
});
