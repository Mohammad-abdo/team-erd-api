import { PlatformRole, TeamRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { slugify } from "../../utils/slug.js";
import { logAdminAudit } from "../../lib/audit.js";
import { isOrgAdmin, isSuperAdmin } from "../../middleware/adminAccess.js";
import { getUserOrganizationId, DEFAULT_ORG_ID, orgWhereClause } from "../../lib/orgScope.js";
import { getDescendantTeamIds, isManagerRole } from "../../lib/teamHierarchy.js";

async function loadUserOrgContext(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, platformRole: true, organizationId: true },
  });
  if (!user) throw new HttpError(401, "Unauthorized");
  return user;
}

async function loadOrganizationSummary(organizationId) {
  if (!organizationId) return null;
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, slug: true },
  });
  if (!org) return null;
  return org;
}

export async function assertCanAccessTeam(userId, teamId) {
  const user = await loadUserOrgContext(userId);
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, organizationId: true },
  });
  if (!team) throw new HttpError(404, "Team not found");

  if (user.platformRole === PlatformRole.SUPER_ADMIN) return { user, team };

  const userOrgId = user.organizationId ?? DEFAULT_ORG_ID;
  const teamOrgId = team.organizationId ?? DEFAULT_ORG_ID;
  if (teamOrgId !== userOrgId) {
    throw new HttpError(403, "Team is outside your organization");
  }

  if (await isOrgAdmin(userId)) return { user, team };

  const member = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
  });
  if (!member) throw new HttpError(403, "Team access required");
  return { user, team, member };
}

async function assertSameOrganization(entityOrgId, otherOrgId, message) {
  const left = entityOrgId ?? DEFAULT_ORG_ID;
  const right = otherOrgId ?? DEFAULT_ORG_ID;
  if (left !== right) throw new HttpError(403, message);
}

async function uniqueTeamSlug(base) {
  let slug = slugify(base);
  for (let i = 0; i < 20; i += 1) {
    const taken = await prisma.team.findUnique({ where: { slug } });
    if (!taken) return slug;
    slug = `${slugify(base)}-${Math.random().toString(36).slice(2, 6)}`;
  }
  throw new HttpError(500, "Could not allocate team slug");
}

export async function assertTeamManager(userId, teamId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { platformRole: true, organizationId: true },
  });
  if (user?.platformRole === PlatformRole.SUPER_ADMIN) return { isAdmin: true };
  if (user?.platformRole === PlatformRole.ORG_ADMIN) {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { organizationId: true },
    });
    const orgId = user.organizationId ?? DEFAULT_ORG_ID;
    if (team && (team.organizationId ?? DEFAULT_ORG_ID) === orgId) {
      return { isAdmin: true };
    }
    throw new HttpError(403, "Team is outside your organization");
  }
  if (user?.platformRole === PlatformRole.TEAM_ADMIN) {
    const member = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
    if (isManagerRole(member?.role)) {
      return { isAdmin: false, member };
    }
    throw new HttpError(403, "Team admin must be team lead or project manager on this team");
  }
  const member = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
  });
  if (!member || !isManagerRole(member.role)) {
    throw new HttpError(403, "Team manager or organization admin required");
  }
  return { isAdmin: false, member };
}

function mapTeam(team) {
  return {
    id: team.id,
    name: team.name,
    slug: team.slug,
    description: team.description,
    color: team.color,
    icon: team.icon,
    organizationId: team.organizationId ?? null,
    parentTeamId: team.parentTeamId ?? null,
    createdAt: team.createdAt,
    memberCount: team._count?.members ?? team.members?.length ?? 0,
    projectCount: team._count?.projects ?? team.projects?.length ?? 0,
    members: team.members?.map((m) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      joinedAt: m.joinedAt,
      user: m.user,
    })),
    projects: team.projects?.map((tp) => ({
      id: tp.project.id,
      name: tp.project.name,
      slug: tp.project.slug,
      assignedAt: tp.assignedAt,
    })),
  };
}

export async function listTeamsForUser(userId) {
  const user = await loadUserOrgContext(userId);
  const organization = await loadOrganizationSummary(user.organizationId ?? DEFAULT_ORG_ID);
  const admin = await isOrgAdmin(userId);
  const orgId = user.organizationId ?? DEFAULT_ORG_ID;

  let teams;
  if (admin) {
    const rows = await prisma.team.findMany({
      where: orgWhereClause(user),
      orderBy: { name: "asc" },
      include: {
        _count: { select: { members: true, projects: true } },
      },
    });
    const membershipRows = await prisma.teamMember.findMany({
      where: { userId, teamId: { in: rows.map((row) => row.id) } },
      select: { teamId: true, role: true },
    });
    const roleByTeam = Object.fromEntries(membershipRows.map((row) => [row.teamId, row.role]));
    teams = rows.map((row) => ({ ...mapTeam(row), myRole: roleByTeam[row.id] ?? null }));
  } else {
    const memberships = await prisma.teamMember.findMany({
      where: {
        userId,
        team: { organizationId: orgId },
      },
      include: {
        team: { include: { _count: { select: { members: true, projects: true } } } },
      },
    });
    teams = memberships.map((m) => ({ ...mapTeam(m.team), myRole: m.role }));
  }

  return { teams, organization };
}

export async function getTeamForUser(userId, teamId) {
  await assertCanAccessTeam(userId, teamId);
  return getTeam(teamId);
}

export async function getTeam(teamId) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
        orderBy: { joinedAt: "asc" },
      },
      projects: {
        include: { project: { select: { id: true, name: true, slug: true, healthStage: true } } },
        orderBy: { assignedAt: "desc" },
      },
      _count: { select: { members: true, projects: true } },
    },
  });
  if (!team) throw new HttpError(404, "Team not found");
  return mapTeam(team);
}

export async function createTeam(userId, input) {
  const orgId = await getUserOrganizationId(userId);
  let parentTeamId = input.parentTeamId ?? null;

  if (parentTeamId) {
    await assertTeamManager(userId, parentTeamId);
    const parent = await prisma.team.findUnique({
      where: { id: parentTeamId },
      select: { organizationId: true },
    });
    if (!parent) throw new HttpError(404, "Parent team not found");
    if (parent.organizationId && parent.organizationId !== orgId && !(await isSuperAdmin(userId))) {
      throw new HttpError(403, "Parent team is in another organization");
    }
  } else if (!(await isSuperAdmin(userId)) && !(await isOrgAdmin(userId))) {
    throw new HttpError(403, "Only platform or org admin can create root teams");
  }

  const slug = await uniqueTeamSlug(input.name);
  const team = await prisma.team.create({
    data: {
      name: input.name.trim(),
      slug,
      description: input.description?.trim() ?? null,
      color: input.color ?? "#0d9488",
      icon: input.icon ?? null,
      organizationId: orgId ?? DEFAULT_ORG_ID,
      parentTeamId,
      createdById: userId,
    },
    include: { _count: { select: { members: true, projects: true } } },
  });

  await prisma.teamMember.upsert({
    where: { teamId_userId: { teamId: team.id, userId } },
    create: { teamId: team.id, userId, role: TeamRole.TEAM_LEAD },
    update: { role: TeamRole.TEAM_LEAD },
  });
  await logAdminAudit({
    userId,
    action: "created",
    entityType: "team",
    entityId: team.id,
    meta: { name: team.name },
  });
  return mapTeam(team);
}

export async function updateTeam(userId, teamId, input) {
  await assertTeamManager(userId, teamId);
  const team = await prisma.team.update({
    where: { id: teamId },
    data: {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.description !== undefined && { description: input.description?.trim() ?? null }),
      ...(input.color !== undefined && { color: input.color }),
      ...(input.icon !== undefined && { icon: input.icon }),
    },
    include: { _count: { select: { members: true, projects: true } } },
  });
  await logAdminAudit({ userId, action: "updated", entityType: "team", entityId: teamId, meta: input });
  return mapTeam(team);
}

export async function deleteTeam(userId, teamId) {
  if (!(await isSuperAdmin(userId))) {
    throw new HttpError(403, "Only platform admin can delete teams");
  }
  await prisma.team.delete({ where: { id: teamId } });
  await logAdminAudit({ userId, action: "deleted", entityType: "team", entityId: teamId });
}

export async function addTeamMember(actorId, teamId, { userId, role }) {
  await assertTeamManager(actorId, teamId);
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { organizationId: true },
  });
  if (!team) throw new HttpError(404, "Team not found");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.isActive) throw new HttpError(404, "User not found");
  if (!(await isSuperAdmin(actorId))) {
    await assertSameOrganization(team.organizationId, user.organizationId, "User is outside team organization");
  }

  const member = await prisma.teamMember.upsert({
    where: { teamId_userId: { teamId, userId } },
    create: { teamId, userId, role: role ?? TeamRole.MEMBER },
    update: { role: role ?? TeamRole.MEMBER },
    include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
  });

  await logAdminAudit({
    userId: actorId,
    action: "added_member",
    entityType: "team",
    entityId: teamId,
    meta: { userId, role: member.role },
  });

  return member;
}

export async function removeTeamMember(actorId, teamId, targetUserId) {
  await assertTeamManager(actorId, teamId);
  await prisma.teamMember.delete({
    where: { teamId_userId: { teamId, userId: targetUserId } },
  });
  await logAdminAudit({
    userId: actorId,
    action: "removed_member",
    entityType: "team",
    entityId: teamId,
    meta: { userId: targetUserId },
  });
}

export async function assignProjectToTeam(actorId, teamId, projectId) {
  await assertTeamManager(actorId, teamId);
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { organizationId: true },
  });
  if (!team) throw new HttpError(404, "Team not found");

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new HttpError(404, "Project not found");
  if (!(await isSuperAdmin(actorId))) {
    await assertSameOrganization(team.organizationId, project.organizationId, "Project is outside team organization");
  }

  const link = await prisma.teamProject.upsert({
    where: { teamId_projectId: { teamId, projectId } },
    create: { teamId, projectId },
    update: {},
    include: { project: { select: { id: true, name: true, slug: true } } },
  });

  await logAdminAudit({
    userId: actorId,
    action: "assigned_project",
    entityType: "team",
    entityId: teamId,
    meta: { projectId },
  });

  return link;
}

export async function unassignProjectFromTeam(actorId, teamId, projectId) {
  await assertTeamManager(actorId, teamId);
  await prisma.teamProject.delete({
    where: { teamId_projectId: { teamId, projectId } },
  });
  await logAdminAudit({
    userId: actorId,
    action: "unassigned_project",
    entityType: "team",
    entityId: teamId,
    meta: { projectId },
  });
}

export async function getUserTeamIds(userId) {
  const admin = await isOrgAdmin(userId);
  if (admin) return null;
  const rows = await prisma.teamMember.findMany({
    where: { userId },
    select: { teamId: true },
  });
  return rows.map((r) => r.teamId);
}
