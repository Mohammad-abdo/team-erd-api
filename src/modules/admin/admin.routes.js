import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requirePlatformAdmin } from "../../middleware/adminAccess.js";
import { validate } from "../../middleware/validate.js";
import {
  assignProjectSchema,
  assignTeamSchema,
  createUserSchema,
  testEmailSchema,
  updateClientAccessSchema,
  updatePlatformBrandingSchema,
  updateUserSchema,
} from "./admin.schemas.js";
import {
  createReportDefinitionSchema,
  createScheduledReportSchema,
  updateReportDefinitionSchema,
  updateScheduledReportSchema,
} from "../analytics/analytics.schemas.js";
import { adminBackupLimiter } from "../../middleware/rateLimits.js";
import * as adminController from "./admin.controller.js";
import * as analyticsController from "../analytics/analytics.controller.js";

const r = Router();

r.use(requireAuth, requirePlatformAdmin);

r.get("/security", adminController.securityOverview);
r.get("/analytics/usage", analyticsController.usage);
r.get("/analytics/metrics", analyticsController.metricCatalog);
r.get("/analytics/report-definitions", analyticsController.listDefinitions);
r.post("/analytics/report-definitions", validate(createReportDefinitionSchema), analyticsController.createDefinition);
r.patch("/analytics/report-definitions/:definitionId", validate(updateReportDefinitionSchema), analyticsController.updateDefinition);
r.delete("/analytics/report-definitions/:definitionId", analyticsController.deleteDefinition);
r.post("/analytics/report-definitions/:definitionId/run", analyticsController.runDefinition);
r.get("/analytics/scheduled-reports", analyticsController.listSchedules);
r.post("/analytics/scheduled-reports", validate(createScheduledReportSchema), analyticsController.createSchedule);
r.patch("/analytics/scheduled-reports/:scheduleId", validate(updateScheduledReportSchema), analyticsController.updateSchedule);
r.delete("/analytics/scheduled-reports/:scheduleId", analyticsController.deleteSchedule);
r.post("/analytics/scheduled-reports/:scheduleId/run", analyticsController.runScheduleNow);
r.get("/settings", adminController.getSettings);
r.patch("/settings", validate(updatePlatformBrandingSchema), adminController.updateSettings);
r.get("/stats", adminController.stats);
r.get("/users", adminController.listUsers);
r.post("/users", validate(createUserSchema), adminController.createUser);
r.get("/users/:userId", adminController.getUser);
r.patch("/users/:userId", validate(updateUserSchema), adminController.updateUser);
r.post("/users/:userId/teams", validate(assignTeamSchema), adminController.assignTeam);
r.delete("/users/:userId/teams/:teamId", adminController.removeTeam);
r.post("/users/:userId/projects", validate(assignProjectSchema), adminController.assignProject);
r.patch(
  "/users/:userId/projects/:projectId/client-access",
  validate(updateClientAccessSchema),
  adminController.updateClientAccess,
);
r.delete("/users/:userId/projects/:projectId", adminController.removeProject);
r.patch("/users/:userId/projects/:projectId/transfer-leader", adminController.transferProjectLeader);
r.get("/projects", adminController.listProjects);
r.get("/audit", adminController.auditLog);
r.get("/security/rate-limits", adminController.rateLimits);
r.get("/backup", adminBackupLimiter, adminController.backup);
r.get("/email/status", adminController.emailStatus);
r.post("/email/test", validate(testEmailSchema), adminController.testEmail);

export default r;
