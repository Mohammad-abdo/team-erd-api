import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireOrgAdmin, requireSuperAdmin } from "../../middleware/adminAccess.js";
import { validate } from "../../middleware/validate.js";
import {
  assignProjectSchema,
  assignTeamSchema,
  bulkUsersSchema,
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

r.use(requireAuth, requireOrgAdmin);

r.get("/security", requireSuperAdmin, adminController.securityOverview);
r.get("/analytics/usage", analyticsController.usage);
r.get("/analytics/metrics", analyticsController.metricCatalog);
r.get("/analytics/report-definitions", analyticsController.listDefinitions);
r.post("/analytics/report-definitions", requireSuperAdmin, validate(createReportDefinitionSchema), analyticsController.createDefinition);
r.patch("/analytics/report-definitions/:definitionId", requireSuperAdmin, validate(updateReportDefinitionSchema), analyticsController.updateDefinition);
r.delete("/analytics/report-definitions/:definitionId", requireSuperAdmin, analyticsController.deleteDefinition);
r.post("/analytics/report-definitions/:definitionId/run", analyticsController.runDefinition);
r.get("/analytics/scheduled-reports", analyticsController.listSchedules);
r.post("/analytics/scheduled-reports", requireSuperAdmin, validate(createScheduledReportSchema), analyticsController.createSchedule);
r.patch("/analytics/scheduled-reports/:scheduleId", requireSuperAdmin, validate(updateScheduledReportSchema), analyticsController.updateSchedule);
r.delete("/analytics/scheduled-reports/:scheduleId", requireSuperAdmin, analyticsController.deleteSchedule);
r.post("/analytics/scheduled-reports/:scheduleId/run", analyticsController.runScheduleNow);
r.get("/settings", adminController.getSettings);
r.patch("/settings", requireSuperAdmin, validate(updatePlatformBrandingSchema), adminController.updateSettings);
r.get("/stats", adminController.stats);
r.get("/users", adminController.listUsers);
r.post("/users", validate(createUserSchema), adminController.createUser);
r.post("/users/bulk", validate(bulkUsersSchema), adminController.bulkUsers);
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
r.get("/invitations", adminController.listInvitations);
r.get("/audit", adminController.auditLog);
r.get("/security/rate-limits", requireSuperAdmin, adminController.rateLimits);
r.get("/backup", requireSuperAdmin, adminBackupLimiter, adminController.backup);
r.get("/email/status", requireSuperAdmin, adminController.emailStatus);
r.post("/email/test", requireSuperAdmin, validate(testEmailSchema), adminController.testEmail);
r.post("/impersonate/:userId", requireSuperAdmin, adminController.startImpersonation);
r.post("/impersonate/stop", requireSuperAdmin, adminController.stopImpersonation);

export default r;
