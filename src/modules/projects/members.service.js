import { randomBytes } from "crypto";
import { PlatformRole, ProjectMemberRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { emitToProject } from "../../sockets/emit.js";
import { logActivity } from "../activity/activity.service.js";
import { sendEmail } from "../../lib/email.js";
import { config } from "../../config/index.js";
import { logAdminAudit } from "../../lib/audit.js";

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

export async function addMemberDirect({ projectId, userId, role, addedById, asAdmin = false }) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, leaderId: true },
  });
  if (!project) throw new HttpError(404, "Project not found");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isActive: true },
  });
  if (!user?.isActive) throw new HttpError(404, "User not found");

  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (existing) throw new HttpError(409, "User is already a member");

  const member = await prisma.projectMember.create({
    data: { projectId, userId, role },
    include: {
      user: { select: { id: true, name: true, email: true, avatar: true } },
    },
  });

  await logActivity({
    projectId,
    userId: addedById,
    action: "created",
    entityType: "project_member",
    entityId: member.id,
    newValues: { userId, role, direct: true, asAdmin },
  });

  const { deliverNotification } = await import("../../lib/notify.js");
  await deliverNotification({
    userId,
    type: "project_added",
    title: `Added to ${project.name}`,
    body: `You were added to "${project.name}" as ${role}.`,
    data: { projectId },
  });

  emitToProject(projectId, "members:updated", { at: Date.now() });

  return member;
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
    const { deliverNotification } = await import("../../lib/notify.js");
    await deliverNotification({
      userId: existingUser.id,
      type: "project_invite",
      title: `Invitation to ${project.name}`,
      body: "You have been invited to collaborate on a project.",
      data: { projectId, invitationId: invitation.id, token },
    });
  }

  const inviteUrl = `${config.appUrl}/invite?token=${token}`;
  await sendEmail({
    to: normalized,
    subject: `Invitation to ${project.name} on DBForge`,
    text: `You have been invited to collaborate on "${project.name}" as ${role}.\n\nAccept the invitation:\n${inviteUrl}\n\nThis link expires in 7 days.`,
  });

  return invitation;
}

export async function listPendingInvitations(projectId) {
  return prisma.projectInvitation.findMany({
    where: {
      projectId,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { expiresAt: "asc" },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
    },
  });
}

export async function revokeInvitation({ projectId, invitationId, userId }) {
  const invitation = await prisma.projectInvitation.findFirst({
    where: { id: invitationId, projectId, acceptedAt: null },
  });
  if (!invitation) {
    throw new HttpError(404, "Invitation not found");
  }

  await prisma.projectInvitation.delete({ where: { id: invitation.id } });

  await logActivity({
    projectId,
    userId,
    action: "deleted",
    entityType: "project_invitation",
    entityId: invitation.id,
    oldValues: { email: invitation.email, role: invitation.role },
  });

  emitToProject(projectId, "members:updated", { at: Date.now() });
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

export async function transferProjectLeader({
  projectId,
  newLeaderUserId,
  actorId,
  asAdmin = false,
}) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, leaderId: true },
  });
  if (!project) {
    throw new HttpError(404, "Project not found");
  }
  if (!asAdmin && project.leaderId !== actorId) {
    throw new HttpError(403, "Only the project leader can transfer leadership");
  }
  if (newLeaderUserId === project.leaderId) {
    throw new HttpError(400, "User is already the project leader");
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: newLeaderUserId },
    select: { id: true, isActive: true, platformRole: true },
  });
  if (!targetUser?.isActive) {
    throw new HttpError(404, "User not found");
  }
  if (targetUser.platformRole === PlatformRole.CLIENT) {
    throw new HttpError(400, "Client users cannot be project leaders");
  }

  const oldLeaderId = project.leaderId;

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: projectId },
      data: { leaderId: newLeaderUserId },
    });

    if (oldLeaderId && oldLeaderId !== newLeaderUserId) {
      const oldMember = await tx.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: oldLeaderId } },
      });
      if (oldMember && oldMember.role === ProjectMemberRole.LEADER) {
        await tx.projectMember.update({
          where: { id: oldMember.id },
          data: { role: ProjectMemberRole.EDITOR },
        });
      }
    }

    const existing = await tx.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: newLeaderUserId } },
    });
    if (existing) {
      await tx.projectMember.update({
        where: { id: existing.id },
        data: { role: ProjectMemberRole.LEADER },
      });
    } else {
      await tx.projectMember.create({
        data: {
          projectId,
          userId: newLeaderUserId,
          role: ProjectMemberRole.LEADER,
        },
      });
    }
  });

  await logActivity({
    projectId,
    userId: actorId,
    action: "updated",
    entityType: "project",
    entityId: projectId,
    oldValues: { leaderId: oldLeaderId },
    newValues: { leaderId: newLeaderUserId },
  });

  if (asAdmin) {
    await logAdminAudit({
      userId: actorId,
      action: "transferred_project_leader",
      entityType: "project",
      entityId: projectId,
      meta: { oldLeaderId, newLeaderId: newLeaderUserId },
    });
  }

  emitToProject(projectId, "members:updated", { at: Date.now() });

  return prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      leaderId: true,
      leader: { select: { id: true, name: true, email: true } },
    },
  });
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
