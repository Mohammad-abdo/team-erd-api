import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { blockClientPlatform } from "../../middleware/clientPortal.js";
import { validate } from "../../middleware/validate.js";
import {
  createTeamSchema,
  updateTeamSchema,
  addMemberSchema,
  assignProjectSchema,
} from "./teams.schemas.js";
import * as teamsController from "./teams.controller.js";
import dailyTasksRoutes from "../dailyTasks/daily-tasks.routes.js";

const r = Router();

r.use(requireAuth);
r.use(blockClientPlatform);

r.get("/", teamsController.list);
r.post("/", validate(createTeamSchema), teamsController.create);
r.get("/:teamId", teamsController.getOne);
r.put("/:teamId", validate(updateTeamSchema), teamsController.update);
r.delete("/:teamId", teamsController.remove);
r.post("/:teamId/members", validate(addMemberSchema), teamsController.addMember);
r.delete("/:teamId/members/:userId", teamsController.removeMember);
r.post("/:teamId/projects", validate(assignProjectSchema), teamsController.assignProject);
r.delete("/:teamId/projects/:projectId", teamsController.unassignProject);
r.post("/:teamId/weekly-digest", teamsController.sendWeeklyDigest);
r.use("/:teamId/daily-tasks", dailyTasksRoutes);

export default r;
