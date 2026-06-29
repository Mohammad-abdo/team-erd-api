import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { blockClientPlatform } from "../../middleware/clientPortal.js";
import { validate } from "../../middleware/validate.js";
import { requireTeamLead } from "../../middleware/teamLeadAccess.js";
import {
  createTeamSchema,
  updateTeamSchema,
  addMemberSchema,
  assignProjectSchema,
  updateTeamMemberRoleSchema,
} from "./teams.schemas.js";
import * as teamsController from "./teams.controller.js";
import meetingsRoutes from "../meetings/meetings.routes.js";

const r = Router();

r.use(requireAuth);
r.use(blockClientPlatform);

r.get("/", teamsController.list);
r.post("/", validate(createTeamSchema), teamsController.create);
r.get("/:teamId", teamsController.getOne);
r.put("/:teamId", validate(updateTeamSchema), teamsController.update);
r.delete("/:teamId", teamsController.remove);
r.post("/:teamId/members", requireTeamLead(), validate(addMemberSchema), teamsController.addMember);
r.patch("/:teamId/members/:userId/role", requireTeamLead(), validate(updateTeamMemberRoleSchema), teamsController.updateMemberRole);
r.delete("/:teamId/members/:userId", requireTeamLead(), teamsController.removeMember);
r.post("/:teamId/projects", requireTeamLead(), validate(assignProjectSchema), teamsController.assignProject);
r.delete("/:teamId/projects/:projectId", requireTeamLead(), teamsController.unassignProject);
r.post("/:teamId/weekly-digest", teamsController.sendWeeklyDigest);
r.use("/:teamId/daily-tasks", dailyTasksRoutes);
r.use("/:teamId/meetings", meetingsRoutes);

export default r;
