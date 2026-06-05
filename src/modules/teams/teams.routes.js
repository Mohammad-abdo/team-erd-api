import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import {
  createTeamSchema,
  updateTeamSchema,
  addMemberSchema,
  assignProjectSchema,
} from "./teams.schemas.js";
import * as teamsController from "./teams.controller.js";

const r = Router();

r.use(requireAuth);

r.get("/", teamsController.list);
r.post("/", validate(createTeamSchema), teamsController.create);
r.get("/:teamId", teamsController.getOne);
r.put("/:teamId", validate(updateTeamSchema), teamsController.update);
r.delete("/:teamId", teamsController.remove);
r.post("/:teamId/members", validate(addMemberSchema), teamsController.addMember);
r.delete("/:teamId/members/:userId", teamsController.removeMember);
r.post("/:teamId/projects", validate(assignProjectSchema), teamsController.assignProject);
r.delete("/:teamId/projects/:projectId", teamsController.unassignProject);

export default r;
