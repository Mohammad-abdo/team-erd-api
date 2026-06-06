import { Router } from "express";
import { ProjectMemberRole } from "@prisma/client";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { blockClientUsers } from "../../middleware/clientPortal.js";
import {
  loadProjectMember,
  requireProjectLeader,
  requireProjectRole,
} from "../../middleware/projectAccess.js";
import { addMemberSchema, inviteMemberSchema, updateMemberRoleSchema } from "./members.schemas.js";
import * as membersController from "./members.controller.js";

const r = Router({ mergeParams: true });

r.use(requireAuth);
r.use(loadProjectMember);
r.use(blockClientUsers);

r.get("/", membersController.list);
r.get("/invitations", requireProjectRole(ProjectMemberRole.EDITOR), membersController.listInvitations);
r.post(
  "/",
  requireProjectRole(ProjectMemberRole.EDITOR),
  validate(addMemberSchema),
  membersController.add,
);
r.post(
  "/invite",
  requireProjectRole(ProjectMemberRole.EDITOR),
  validate(inviteMemberSchema),
  membersController.invite,
);
r.delete(
  "/invitations/:invitationId",
  requireProjectRole(ProjectMemberRole.EDITOR),
  membersController.revokeInvitation,
);
r.put(
  "/:userId/role",
  requireProjectLeader,
  validate(updateMemberRoleSchema),
  membersController.updateRole,
);
r.delete("/:userId", requireProjectLeader, membersController.remove);

export default r;
