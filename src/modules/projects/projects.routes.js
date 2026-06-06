import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { createProjectSchema, updateProjectSchema } from "./projects.schemas.js";
import * as projectsController from "./projects.controller.js";
import { refreshProjectHealth } from "./projectHealth.service.js";
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

const r = Router();

r.use(requireAuth);

r.get("/", projectsController.list);
r.post("/", validate(createProjectSchema), projectsController.create);

/* Full report & fragments — must stay above /:id so paths like /:projectId/report are not treated as getOne("report"). */
r.get("/:projectId/report/stats", loadProjectMember, getProjectStats);
r.get("/:projectId/report/tables", loadProjectMember, getProjectTables);
r.get("/:projectId/report/api", loadProjectMember, getProjectApi);
r.get("/:projectId/report/team", loadProjectMember, getProjectTeam);
r.get("/:projectId/report/tasks", loadProjectMember, getProjectTasks);
r.get("/:projectId/report", loadProjectMember, getProjectReport);

r.post(
  "/:projectId/health/refresh",
  loadProjectMember,
  asyncHandler(async (req, res) => {
    const healthStage = await refreshProjectHealth(req.params.projectId);
    res.json({ healthStage });
  }),
);

r.get("/:id", projectsController.getOne);
r.put("/:id", validate(updateProjectSchema), projectsController.update);
r.delete("/:id", projectsController.remove);

export default r;
