import { PlatformRole } from "@prisma/client";
import { prisma } from "./prisma.js";
import { HttpError } from "../utils/httpError.js";
import { DEFAULT_ORG_ID, orgWhereClause } from "./orgScope.js";

/** @typedef {{ adminId: string, user: { id: string, platformRole: PlatformRole, organizationId: string | null }, isSuperAdmin: boolean, orgWhere: Record<string, unknown> }} AdminActor */

/** Load admin actor and org filter for ORG_ADMIN; SUPER_ADMIN sees all. */
export async function loadAdminActor(adminId) {
  const user = await prisma.user.findUnique({
    where: { id: adminId },
    select: { id: true, platformRole: true, organizationId: true, isActive: true },
  });
  if (!user?.isActive) {
    throw new HttpError(403, "Admin access required");
  }
  const isSuperAdmin = user.platformRole === PlatformRole.SUPER_ADMIN;
  const isOrgAdmin = user.platformRole === PlatformRole.ORG_ADMIN;
  if (!isSuperAdmin && !isOrgAdmin) {
    throw new HttpError(403, "Organization admin access required");
  }
  return {
    adminId,
    user,
    isSuperAdmin,
    orgWhere: isSuperAdmin ? {} : orgWhereClause(user),
  };
}

export async function assertUserInOrgScope(actor, targetUserId) {
  if (actor.isSuperAdmin) return;
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { organizationId: true, platformRole: true },
  });
  if (!target) throw new HttpError(404, "User not found");
  const orgId = actor.user.organizationId ?? DEFAULT_ORG_ID;
  if ((target.organizationId ?? DEFAULT_ORG_ID) !== orgId) {
    throw new HttpError(403, "User is outside your organization");
  }
  if (target.platformRole === PlatformRole.SUPER_ADMIN) {
    throw new HttpError(403, "Cannot manage platform super admin");
  }
}

export async function assertTeamInOrgScope(actor, teamId) {
  if (actor.isSuperAdmin) return;
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { organizationId: true },
  });
  if (!team) throw new HttpError(404, "Team not found");
  const orgId = actor.user.organizationId ?? DEFAULT_ORG_ID;
  if ((team.organizationId ?? DEFAULT_ORG_ID) !== orgId) {
    throw new HttpError(403, "Team is outside your organization");
  }
}

export async function assertProjectInOrgScope(actor, projectId) {
  if (actor.isSuperAdmin) return;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { organizationId: true },
  });
  if (!project) throw new HttpError(404, "Project not found");
  const orgId = actor.user.organizationId ?? DEFAULT_ORG_ID;
  if ((project.organizationId ?? DEFAULT_ORG_ID) !== orgId) {
    throw new HttpError(403, "Project is outside your organization");
  }
}

/** Roles an ORG_ADMIN may assign; SUPER_ADMIN may assign any. */
export function allowedPlatformRolesForActor(actor) {
  if (actor.isSuperAdmin) {
    return Object.values(PlatformRole);
  }
  return [PlatformRole.MEMBER, PlatformRole.CLIENT, PlatformRole.TEAM_ADMIN, PlatformRole.ORG_ADMIN];
}

export function assertAssignablePlatformRole(actor, role) {
  const allowed = allowedPlatformRolesForActor(actor);
  if (!allowed.includes(role)) {
    throw new HttpError(403, "You cannot assign this platform role");
  }
}

export function userWhereForAdmin(actor) {
  if (actor.isSuperAdmin) return {};
  return { organizationId: actor.user.organizationId ?? DEFAULT_ORG_ID };
}
