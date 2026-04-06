import { randomBytes } from "crypto";
import { ProjectMemberRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { emitToProject } from "../../sockets/emit.js";
import { logActivity } from "../activity/activity.service.js";

const INVITE_MS = 7 * 24 * 60 * 60 * 1000;

export async function listMembers(projectId) {
  return prisma.projectMember.findMany({
    where: { projectId },
    orderBy: { joinedAt: "asc" },
    include: {
      user: {
        select: { id: true, name: true, email: true, avatar: true },
      },
    },
  });
}

export async function inviteMember({ projectId, invitedById, email, role }) {
  const normalized = email.trim().toLowerCase();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, leaderId: true },
  });
  if (!project) {
    throw new HttpError(404, "Project not found");
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: normalized },
    select: { id: true },
  });

  if (existingUser) {
    const already = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId, userId: existingUser.id },
      },
    });
    if (already) {
      throw new HttpError(409, "User is already a member");
    }
  }

  const pending = await prisma.projectInvitation.findFirst({
    where: {
      projectId,
      email: normalized,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (pending) {
    throw new HttpError(409, "An active invitation already exists for this email");
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INVITE_MS);

  const invitation = await prisma.projectInvitation.create({
    data: {
      projectId,
      email: normalized,
      token,
      role,
      expiresAt,
    },
  });

  await logActivity({
    projectId,
    userId: invitedById,
    action: "created",
    entityType: "project_invitation",
    entityId: invitation.id,
    newValues: { email: normalized, role },
  });

  emitToProject(projectId, "members:updated", { at: Date.now() });

  if (existingUser) {
    await prisma.notification.create({
      data: {
        userId: existingUser.id,
        type: "project_invite",
        title: `Invitation to ${project.name}`,
        body: "You have been invited to collaborate on a project.",
        data: { projectId, invitationId: invitation.id, token },
      },
    });
  }

  return invitation;
}

export async function updateMemberRole({ projectId, leaderId, targetUserId, role }) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { leaderId: true },
  });
  if (!project) {
    throw new HttpError(404, "Project not found");
  }
  if (project.leaderId !== leaderId) {
    throw new HttpError(403, "Only the leader can change roles");
  }
  if (targetUserId === project.leaderId) {
    throw new HttpError(400, "Cannot change the leader's role");
  }

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: targetUserId } },
  });
  if (!member) {
    throw new HttpError(404, "Member not found");
  }

  const updated = await prisma.projectMember.update({
    where: { id: member.id },
    data: { role },
    include: {
      user: { select: { id: true, name: true, email: true, avatar: true } },
    },
  });

  await logActivity({
    projectId,
    userId: leaderId,
    action: "updated",
    entityType: "project_member",
    entityId: member.id,
    oldValues: { role: member.role },
    newValues: { role: updated.role },
  });

  emitToProject(projectId, "members:updated", { at: Date.now() });

  return updated;
}

export async function removeMember({ projectId, leaderId, targetUserId }) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { leaderId: true },
  });
  if (!project) {
    throw new HttpError(404, "Project not found");
  }
  if (project.leaderId !== leaderId) {
    throw new HttpError(403, "Only the leader can remove members");
  }
  if (targetUserId === project.leaderId) {
    throw new HttpError(400, "Cannot remove the project leader");
  }

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: targetUserId } },
  });
  if (!member) {
    throw new HttpError(404, "Member not found");
  }

  await prisma.projectMember.delete({ where: { id: member.id } });

  await logActivity({
    projectId,
    userId: leaderId,
    action: "deleted",
    entityType: "project_member",
    entityId: member.id,
    oldValues: { userId: targetUserId, role: member.role },
  });

  emitToProject(projectId, "members:updated", { at: Date.now() });
}

export async function acceptInvitation({ userId, userEmail, token }) {
  const invitation = await prisma.projectInvitation.findUnique({
    where: { token },
    include: { project: { select: { id: true, name: true } } },
  });

  if (!invitation || invitation.acceptedAt) {
    throw new HttpError(400, "Invalid or already used invitation");
  }
  if (invitation.expiresAt < new Date()) {
    throw new HttpError(400, "Invitation has expired");
  }

  if (invitation.email !== userEmail.trim().toLowerCase()) {
    throw new HttpError(403, "Signed-in user does not match invitation email");
  }

  const existing = await prisma.projectMember.findUnique({
    where: {
      projectId_userId: { projectId: invitation.projectId, userId },
    },
  });

  if (existing) {
    await prisma.projectInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });
    return { projectId: invitation.projectId, member: existing, alreadyMember: true };
  }

  const member = await prisma.$transaction(async (tx) => {
    const m = await tx.projectMember.create({
      data: {
        projectId: invitation.projectId,
        userId,
        role: invitation.role,
      },
    });
    await tx.projectInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });
    return m;
  });

  await logActivity({
    projectId: invitation.projectId,
    userId,
    action: "created",
    entityType: "project_member",
    entityId: member.id,
    newValues: { role: member.role },
  });

  emitToProject(invitation.projectId, "members:updated", { at: Date.now() });

  return { projectId: invitation.projectId, member, alreadyMember: false };
}
