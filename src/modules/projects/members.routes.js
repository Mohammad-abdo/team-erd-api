import { Router } from "express";
import { ProjectMemberRole } from "@prisma/client";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import {
  loadProjectMember,
  requireProjectLeader,
  requireProjectRole,
} from "../../middleware/projectAccess.js";
import { inviteMemberSchema, updateMemberRoleSchema } from "./members.schemas.js";
import * as membersController from "./members.controller.js";

const r = Router({ mergeParams: true });

r.use(requireAuth);
r.use(loadProjectMember);

r.get("/", membersController.list);
r.post(
  "/invite",
  requireProjectRole(ProjectMemberRole.EDITOR),
  validate(inviteMemberSchema),
  membersController.invite,
);
r.put(
  "/:userId/role",
  requireProjectLeader,
  validate(updateMemberRoleSchema),
  membersController.updateRole,
);
r.delete("/:userId", requireProjectLeader, membersController.remove);

export default r;
