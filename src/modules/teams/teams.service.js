import { PlatformRole, TeamRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { slugify } from "../../utils/slug.js";
import { logAdminAudit } from "../../lib/audit.js";
import { isPlatformAdmin } from "../../middleware/adminAccess.js";

async function uniqueTeamSlug(base) {
  let slug = slugify(base);
  for (let i = 0; i < 20; i += 1) {
    const taken = await prisma.team.findUnique({ where: { slug } });
    if (!taken) return slug;
    slug = `${slugify(base)}-${Math.random().toString(36).slice(2, 6)}`;
  }
  throw new HttpError(500, "Could not allocate team slug");
}

async function assertTeamManager(userId, teamId) {
  const admin = await isPlatformAdmin(userId);
  if (admin) return { isAdmin: true };
  const member = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
  });
  if (!member || member.role !== TeamRole.TEAM_LEAD) {
    throw new HttpError(403, "Team lead or platform admin required");
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
  const admin = await isPlatformAdmin(userId);
  if (admin) {
    const teams = await prisma.team.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { members: true, projects: true } },
      },
    });
    return teams.map(mapTeam);
  }
  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    include: {
      team: { include: { _count: { select: { members: true, projects: true } } } },
    },
  });
  return memberships.map((m) => ({ ...mapTeam(m.team), myRole: m.role }));
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
  if (!(await isPlatformAdmin(userId))) {
    throw new HttpError(403, "Only platform admin can create teams");
  }
  const slug = await uniqueTeamSlug(input.name);
  const team = await prisma.team.create({
    data: {
      name: input.name.trim(),
      slug,
      description: input.description?.trim() ?? null,
      color: input.color ?? "#0d9488",
      icon: input.icon ?? null,
      createdById: userId,
    },
    include: { _count: { select: { members: true, projects: true } } },
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
  if (!(await isPlatformAdmin(userId))) {
    throw new HttpError(403, "Only platform admin can delete teams");
  }
  await prisma.team.delete({ where: { id: teamId } });
  await logAdminAudit({ userId, action: "deleted", entityType: "team", entityId: teamId });
}

export async function addTeamMember(actorId, teamId, { userId, role }) {
  await assertTeamManager(actorId, teamId);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.isActive) throw new HttpError(404, "User not found");

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
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new HttpError(404, "Project not found");

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
  const admin = await isPlatformAdmin(userId);
  if (admin) return null;
  const rows = await prisma.teamMember.findMany({
    where: { userId },
    select: { teamId: true },
  });
  return rows.map((r) => r.teamId);
}
