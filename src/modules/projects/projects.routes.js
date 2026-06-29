import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { createProjectSchema, updateProjectSchema } from "./projects.schemas.js";
import * as projectsController from "./projects.controller.js";
import { getProjectHealth, refreshProjectHealth } from "./projectHealth.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  getProjectReport,
  getProjectStats,
  getProjectTables,
  getProjectApi,
  getProjectTeam,
  getProjectTasks,
} from "../report/report.controller.js";
import { loadProjectMember } from "../../middleware/projectAccess.js";
import {
  blockClientPlatform,
  requireClientHealthAccess,
  requireClientReportAccess,
} from "../../middleware/clientPortal.js";
import attachmentsRouter from "./attachments.routes.js";

const r = Router();

r.use(requireAuth);

r.get("/", projectsController.list);
r.post("/", blockClientPlatform, validate(createProjectSchema), projectsController.create);

/* Full report & fragments — must stay above /:id so paths like /:projectId/report are not treated as getOne("report"). */
r.get("/:projectId/report/stats", loadProjectMember, requireClientReportAccess, getProjectStats);
r.get("/:projectId/report/tables", loadProjectMember, requireClientReportAccess, getProjectTables);
r.get("/:projectId/report/api", loadProjectMember, requireClientReportAccess, getProjectApi);
r.get("/:projectId/report/team", loadProjectMember, requireClientReportAccess, getProjectTeam);
r.get("/:projectId/report/tasks", loadProjectMember, requireClientReportAccess, getProjectTasks);
r.get("/:projectId/report", loadProjectMember, requireClientReportAccess, getProjectReport);

r.get(
  "/:projectId/health",
  loadProjectMember,
  requireClientHealthAccess,
  asyncHandler(async (req, res) => {
    const health = await getProjectHealth(req.params.projectId);
    res.json(health);
  }),
);

r.post(
  "/:projectId/health/refresh",
  loadProjectMember,
  asyncHandler(async (req, res) => {
    const healthStage = await refreshProjectHealth(req.params.projectId);
    res.json({ healthStage });
  }),
);

r.use("/:projectId/attachments", attachmentsRouter);

r.get("/:id", projectsController.getOne);
r.put("/:id", validate(updateProjectSchema), projectsController.update);
r.delete("/:id", projectsController.remove);

export default r;
