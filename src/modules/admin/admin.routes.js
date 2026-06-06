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
import { adminBackupLimiter } from "../../middleware/rateLimits.js";
import * as adminController from "./admin.controller.js";

const r = Router();

r.use(requireAuth, requirePlatformAdmin);

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
r.get("/projects", adminController.listProjects);
r.get("/audit", adminController.auditLog);
r.get("/security/rate-limits", adminController.rateLimits);
r.get("/backup", adminBackupLimiter, adminController.backup);
r.get("/email/status", adminController.emailStatus);
r.post("/email/test", validate(testEmailSchema), adminController.testEmail);

export default r;
