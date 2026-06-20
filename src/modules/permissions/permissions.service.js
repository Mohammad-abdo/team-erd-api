import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { logActivity } from "../activity/activity.service.js";

import { roleAllowsAction } from "../../lib/rolePermissionDefaults.js";

const RESOURCES = ["ERD", "API", "COMMENTS", "EXPORTS", "TASKS"];
const ACTIONS = ["VIEW", "CREATE", "EDIT", "DELETE"];

export async function getEffectivePermissions(projectId, userId) {
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!member) throw new HttpError(404, "User is not a project member");

  const overrides = await prisma.projectPermission.findMany({
    where: { projectId, userId },
  });

  const defaults = {};
  const effective = {};
  const overrideMap = {};

  for (const resource of RESOURCES) {
    defaults[resource] = ACTIONS.filter((action) => roleAllowsAction(member.role, resource, action));
    effective[resource] = [...defaults[resource]];
    overrideMap[resource] = {};
  }

  for (const row of overrides) {
    overrideMap[row.resource][row.action] = true;
    if (!effective[row.resource].includes(row.action)) {
      effective[row.resource].push(row.action);
    }
  }

  return {
    role: member.role,
    defaults,
    overrides: overrideMap,
    effective,
  };
}

export async function listPermissions(projectId) {
  return prisma.projectPermission.findMany({
    where: { projectId },
    orderBy: [{ userId: "asc" }, { resource: "asc" }, { action: "asc" }],
    include: {
      user: { select: { id: true, name: true, email: true } },
      grantedBy: { select: { id: true, name: true } },
    },
  });
}

export async function grantPermission({ projectId, leaderId, userId, resource, action }) {
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!member) {
    throw new HttpError(404, "User is not a project member");
  }

  const permission = await prisma.projectPermission.upsert({
    where: {
      projectId_userId_resource_action: { projectId, userId, resource, action },
    },
    create: {
      projectId,
      userId,
      resource,
      action,
      grantedById: leaderId,
    },
    update: { grantedById: leaderId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      grantedBy: { select: { id: true, name: true } },
    },
  });

  await logActivity({
    projectId,
    userId: leaderId,
    action: "created",
    entityType: "project_permission",
    entityId: permission.id,
    newValues: { userId, resource, action },
  });

  return permission;
}

export async function revokePermission({ projectId, leaderId, userId, resource, action }) {
  const existing = await prisma.projectPermission.findUnique({
    where: {
      projectId_userId_resource_action: { projectId, userId, resource, action },
    },
  });
  if (!existing) {
    throw new HttpError(404, "Permission grant not found");
  }

  await prisma.projectPermission.delete({ where: { id: existing.id } });

  await logActivity({
    projectId,
    userId: leaderId,
    action: "deleted",
    entityType: "project_permission",
    entityId: existing.id,
    oldValues: { userId, resource, action },
  });
}
