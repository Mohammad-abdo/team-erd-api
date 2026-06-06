import { z } from "zod";

export const AVAILABLE_METRICS = [
  "projects",
  "tables",
  "relations",
  "api_routes",
  "comments",
  "activity",
  "tasks",
  "members",
  "drift",
];

export const usageQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(90).optional().default(30),
});

const filtersSchema = z.object({
  visibility: z.enum(["PRIVATE", "PUBLIC"]).optional(),
  teamId: z.string().min(1).optional(),
  projectIds: z.array(z.string().min(1)).optional(),
}).optional();

const reportDefinitionBodySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  scope: z.enum(["PLATFORM", "PROJECT"]).default("PLATFORM"),
  projectId: z.string().min(1).optional(),
  metrics: z.array(z.string().min(1)).min(1).refine(
    (arr) => arr.every((m) => AVAILABLE_METRICS.includes(m)),
    { message: "Invalid metric key" },
  ),
  filters: filtersSchema,
  format: z.enum(["JSON", "MARKDOWN"]).default("MARKDOWN"),
});

function requireProjectIdForScope(data, ctx) {
  if (data.scope === "PROJECT" && !data.projectId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "projectId is required for PROJECT scope",
      path: ["projectId"],
    });
  }
}

export const createReportDefinitionSchema = reportDefinitionBodySchema.superRefine(requireProjectIdForScope);

export const updateReportDefinitionSchema = reportDefinitionBodySchema.partial().superRefine((data, ctx) => {
  if (data.scope === "PROJECT" && data.projectId === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "projectId is required when setting PROJECT scope",
      path: ["projectId"],
    });
  }
});

const scheduledReportBodySchema = z.object({
  definitionId: z.string().min(1),
  enabled: z.boolean().optional().default(true),
  cadence: z.enum(["DAILY", "WEEKLY"]).default("WEEKLY"),
  utcDay: z.number().int().min(0).max(6).optional().default(1),
  utcHour: z.number().int().min(0).max(23).optional().default(8),
  recipientEmails: z.array(z.string().email()).min(1),
});

export const createScheduledReportSchema = scheduledReportBodySchema;

export const updateScheduledReportSchema = scheduledReportBodySchema.partial().omit({ definitionId: true });
