import { asyncHandler } from "../../utils/asyncHandler.js";
import * as membersService from "./members.service.js";

export const list = asyncHandler(async (req, res) => {
  const members = await membersService.listMembers(req.params.projectId);
  res.json({
    members: members.map((m) => ({
      id: m.id,
      role: m.role,
      joinedAt: m.joinedAt,
      user: m.user,
    })),
  });
});

export const invite = asyncHandler(async (req, res) => {
  const invitation = await membersService.inviteMember({
    projectId: req.params.projectId,
    invitedById: req.user.sub,
    email: req.body.email,
    role: req.body.role,
  });

  res.status(201).json({
    invitation: {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      token: invitation.token,
    },
  });
});

export const updateRole = asyncHandler(async (req, res) => {
  const member = await membersService.updateMemberRole({
    projectId: req.params.projectId,
    leaderId: req.user.sub,
    targetUserId: req.params.userId,
    role: req.body.role,
  });
  res.json({
    member: {
      id: member.id,
      role: member.role,
      joinedAt: member.joinedAt,
      user: member.user,
    },
  });
});

export const remove = asyncHandler(async (req, res) => {
  await membersService.removeMember({
    projectId: req.params.projectId,
    leaderId: req.user.sub,
    targetUserId: req.params.userId,
  });
  res.status(204).end();
});
