import { asyncHandler } from "../../utils/asyncHandler.js";
import { config } from "../../config/index.js";
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

export const add = asyncHandler(async (req, res) => {
  const member = await membersService.addMemberDirect({
    projectId: req.params.projectId,
    userId: req.body.userId,
    role: req.body.role,
    addedById: req.user.sub,
  });
  res.status(201).json({
    member: {
      id: member.id,
      role: member.role,
      joinedAt: member.joinedAt,
      user: member.user,
    },
  });
});

export const listInvitations = asyncHandler(async (req, res) => {
  const invitations = await membersService.listPendingInvitations(req.params.projectId);
  res.json({ invitations });
});

export const invite = asyncHandler(async (req, res) => {
  const invitation = await membersService.inviteMember({
    projectId: req.params.projectId,
    invitedById: req.user.sub,
    email: req.body.email,
    role: req.body.role,
  });

  const inviteUrl = `${config.appUrl}/invite?token=${invitation.token}`;

  res.status(201).json({
    invitation: {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      token: invitation.token,
      inviteUrl,
    },
  });
});

export const revokeInvitation = asyncHandler(async (req, res) => {
  await membersService.revokeInvitation({
    projectId: req.params.projectId,
    invitationId: req.params.invitationId,
    userId: req.user.sub,
  });
  res.status(204).end();
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
