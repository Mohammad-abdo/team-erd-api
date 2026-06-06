import { asyncHandler } from "../../utils/asyncHandler.js";
import { getPlatformUsage } from "./usage.service.js";
import {
  AVAILABLE_METRICS,
  createReportDefinitionSchema,
  createScheduledReportSchema,
  updateReportDefinitionSchema,
  updateScheduledReportSchema,
  usageQuerySchema,
} from "./analytics.schemas.js";
import {
  createReportDefinition,
  deleteReportDefinition,
  executeCustomReport,
  getReportDefinition,
  listReportDefinitions,
  updateReportDefinition,
} from "./customReport.service.js";
import {
  createScheduledReport,
  deleteScheduledReport,
  listScheduledReports,
  runDueScheduledReports,
  runScheduledReportById,
  updateScheduledReport,
} from "./scheduledReport.service.js";

export const usage = asyncHandler(async (req, res) => {
  const { days } = usageQuerySchema.parse(req.query);
  res.json(await getPlatformUsage({ days }));
});

export const metricCatalog = asyncHandler(async (_req, res) => {
  res.json({ metrics: AVAILABLE_METRICS });
});

export const listDefinitions = asyncHandler(async (_req, res) => {
  res.json({ definitions: await listReportDefinitions() });
});

export const createDefinition = asyncHandler(async (req, res) => {
  const input = createReportDefinitionSchema.parse(req.body);
  const row = await createReportDefinition(req.user.sub, input);
  res.status(201).json({ definition: row });
});

export const updateDefinition = asyncHandler(async (req, res) => {
  const input = updateReportDefinitionSchema.parse(req.body);
  const row = await updateReportDefinition(req.params.definitionId, input);
  res.json({ definition: row });
});

export const deleteDefinition = asyncHandler(async (req, res) => {
  await deleteReportDefinition(req.params.definitionId);
  res.status(204).end();
});

export const runDefinition = asyncHandler(async (req, res) => {
  const definition = await getReportDefinition(req.params.definitionId);
  const result = await executeCustomReport(definition);
  res.json(result);
});

export const listSchedules = asyncHandler(async (_req, res) => {
  res.json({ schedules: await listScheduledReports() });
});

export const createSchedule = asyncHandler(async (req, res) => {
  const input = createScheduledReportSchema.parse(req.body);
  const row = await createScheduledReport(req.user.sub, input);
  res.status(201).json({ schedule: row });
});

export const updateSchedule = asyncHandler(async (req, res) => {
  const input = updateScheduledReportSchema.parse(req.body);
  const row = await updateScheduledReport(req.params.scheduleId, input);
  res.json({ schedule: row });
});

export const deleteSchedule = asyncHandler(async (req, res) => {
  await deleteScheduledReport(req.params.scheduleId);
  res.status(204).end();
});

export const runScheduleNow = asyncHandler(async (req, res) => {
  const result = await runScheduledReportById(req.params.scheduleId);
  res.json(result);
});

export const runDueSchedules = asyncHandler(async (_req, res) => {
  res.json(await runDueScheduledReports());
});
