import { AccessRequestStatus, ProjectMemberRole, TeamRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { deliverNotification } from "../../lib/notify.js";
import { addMemberDirect } from "../projects/members.service.js";
import { resolveProjectMembership } from "../../lib/projectMembership.js";

async function assertCanReview(projectId, actorId) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { leaderId: true },
  });
  if (!project) throw new HttpError(404, "Project not found");
  if (project.leaderId === actorId) return project;

  const teamLead = await prisma.teamProject.findFirst({
    where: {
      projectId,
      team: { members: { some: { userId: actorId, role: TeamRole.TEAM_LEAD } } },
    },
  });
  if (teamLead) return project;

  throw new HttpError(403, "Only project leader or team lead can review access requests");
}

export async function createAccessRequest({ projectId, userId, requestedRole, message }) {
  const direct = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (direct && direct.role !== ProjectMemberRole.VIEWER) {
    throw new HttpError(400, "You already have direct project access");
  }

  const teamOnly = !direct && await resolveProjectMembership(projectId, userId);
  if (!direct && !teamOnly) {
    throw new HttpError(403, "You must have team access to request elevated permissions");
  }

  const existing = await prisma.accessRequest.findFirst({
    where: { projectId, userId, status: AccessRequestStatus.PENDING },
  });
  if (existing) throw new HttpError(409, "A pending request already exists");

  const request = await prisma.accessRequest.create({
    data: {
      projectId,
      userId,
      requestedRole: requestedRole ?? ProjectMemberRole.EDITOR,
      message: message?.trim() || null,
    },
    include: {
      project: { select: { id: true, name: true, leaderId: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  });

  await deliverNotification({
    userId: request.project.leaderId,
    type: "access_request",
    title: "Project access request",
    body: `${request.user.name} requested ${request.requestedRole} access to ${request.project.name}`,
    data: { projectId, requestId: request.id },
  });

  return request;
}

export async function listProjectAccessRequests(projectId, actorId) {
  await assertCanReview(projectId, actorId);
  return prisma.accessRequest.findMany({
    where: { projectId, status: AccessRequestStatus.PENDING },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, name: true, email: true, avatar: true } },
    },
  });
}

export async function reviewAccessRequest({ requestId, actorId, status }) {
  const request = await prisma.accessRequest.findUnique({
    where: { id: requestId },
    include: {
      project: { select: { id: true, name: true, leaderId: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  });
  if (!request || request.status !== AccessRequestStatus.PENDING) {
    throw new HttpError(404, "Access request not found");
  }

  await assertCanReview(request.projectId, actorId);

  if (status === AccessRequestStatus.DENIED) {
    const updated = await prisma.accessRequest.update({
      where: { id: requestId },
      data: {
        status: AccessRequestStatus.DENIED,
        reviewedById: actorId,
        reviewedAt: new Date(),
      },
    });
    await deliverNotification({
      userId: request.userId,
      type: "access_request_denied",
      title: "Access request denied",
      body: `Your request for ${request.project.name} was denied`,
      data: { projectId: request.projectId, requestId },
    });
    return updated;
  }

  if (status === AccessRequestStatus.APPROVED) {
    const existing = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: request.projectId, userId: request.userId } },
    });
    if (existing) {
      await prisma.projectMember.update({
        where: { id: existing.id },
        data: { role: request.requestedRole },
      });
    } else {
      await addMemberDirect({
        projectId: request.projectId,
        userId: request.userId,
        role: request.requestedRole,
        addedById: actorId,
      });
    }

    const updated = await prisma.accessRequest.update({
      where: { id: requestId },
      data: {
        status: AccessRequestStatus.APPROVED,
        reviewedById: actorId,
        reviewedAt: new Date(),
      },
    });

    await deliverNotification({
      userId: request.userId,
      type: "access_request_approved",
      title: "Access request approved",
      body: `You now have ${request.requestedRole} access to ${request.project.name}`,
      data: { projectId: request.projectId, requestId },
    });

    return updated;
  }

  throw new HttpError(400, "Invalid status");
}
