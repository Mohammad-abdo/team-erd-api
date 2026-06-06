import bcrypt from "bcryptjs";
import { PlatformRole, ProjectMemberRole, TeamRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { logAdminAudit } from "../../lib/audit.js";
import { enrichUserProfile } from "../../lib/userProfile.js";
import { serializeClientAccess, upsertClientProjectAccess } from "../../lib/clientPortal.js";
import * as teamsService from "../teams/teams.service.js";
import { addMemberDirect } from "../projects/members.service.js";

const SALT_ROUNDS = 10;

export async function getPlatformStats() {
  const [users, teams, projects, activeUsers, recentAudit] = await Promise.all([
    prisma.user.count(),
    prisma.team.count(),
    prisma.project.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.adminAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
  ]);
  return { users, teams, projects, activeUsers, recentAudit };
}

export async function listAllUsers({ skip = 0, take = 50 } = {}) {
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        platformRole: true,
        isActive: true,
        createdAt: true,
        teamMemberships: {
          include: { team: { select: { id: true, name: true, slug: true, color: true } } },
        },
        _count: { select: { projectMembers: true } },
      },
    }),
    prisma.user.count(),
  ]);
  return {
    total,
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      avatar: u.avatar,
      platformRole: u.platformRole,
      isActive: u.isActive,
      createdAt: u.createdAt,
      projectCount: u._count.projectMembers,
      teams: u.teamMemberships.map((m) => ({
        id: m.team.id,
        name: m.team.name,
        slug: m.team.slug,
        color: m.team.color,
        role: m.role,
      })),
    })),
  };
}

export async function createUser(adminId, input) {
  const normalized = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (existing) throw new HttpError(409, "Email already registered");

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      name: input.name.trim(),
      email: normalized,
      passwordHash,
      platformRole: input.platformRole ?? PlatformRole.MEMBER,
    },
  });

  await logAdminAudit({
    userId: adminId,
    action: "created",
    entityType: "user",
    entityId: user.id,
    meta: { email: normalized },
  });

  return enrichUserProfile(user.id);
}

export async function getUserDetail(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      avatar: true,
      platformRole: true,
      isActive: true,
      createdAt: true,
      teamMemberships: {
        include: { team: { select: { id: true, name: true, slug: true, color: true } } },
      },
      projectMembers: {
        include: {
          project: { select: { id: true, name: true, slug: true, healthStage: true } },
        },
        orderBy: { joinedAt: "desc" },
      },
      clientProjectAccess: true,
    },
  });
  if (!user) throw new HttpError(404, "User not found");

  const clientAccessByProject = new Map(
    user.clientProjectAccess.map((row) => [row.projectId, serializeClientAccess(row)]),
  );

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    platformRole: user.platformRole,
    isActive: user.isActive,
    createdAt: user.createdAt,
    teams: user.teamMemberships.map((m) => ({
      id: m.team.id,
      name: m.team.name,
      slug: m.team.slug,
      color: m.team.color,
      role: m.role,
    })),
    projects: user.projectMembers.map((m) => ({
      id: m.project.id,
      name: m.project.name,
      slug: m.project.slug,
      healthStage: m.project.healthStage,
      role: m.role,
      joinedAt: m.joinedAt,
      clientAccess: clientAccessByProject.get(m.project.id) ?? null,
    })),
  };
}

export async function updateUser(adminId, userId, input) {
  if (adminId === userId && input.isActive === false) {
    throw new HttpError(400, "Cannot deactivate your own account");
  }

  const data = {
    ...(input.name !== undefined && { name: input.name.trim() }),
    ...(input.isActive !== undefined && { isActive: input.isActive }),
    ...(input.platformRole !== undefined && { platformRole: input.platformRole }),
  };

  if (input.password) {
    data.passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data,
  });

  const auditMeta = { ...input };
  if (auditMeta.password) auditMeta.password = "[reset]";

  await logAdminAudit({
    userId: adminId,
    action: "updated",
    entityType: "user",
    entityId: userId,
    meta: auditMeta,
  });

  return enrichUserProfile(user.id);
}

export async function assignUserToTeam(adminId, userId, { teamId, role }) {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { platformRole: true },
  });
  if (target?.platformRole === PlatformRole.CLIENT) {
    throw new HttpError(400, "Client portal users cannot be assigned to teams");
  }

  const member = await teamsService.addTeamMember(adminId, teamId, {
    userId,
    role: role ?? TeamRole.MEMBER,
  });
  return member;
}

export async function removeUserFromTeam(adminId, userId, teamId) {
  await teamsService.removeTeamMember(adminId, teamId, userId);
}

export async function assignUserToProject(adminId, userId, { projectId, role, clientAccess }) {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { platformRole: true },
  });
  if (!target) throw new HttpError(404, "User not found");

  const effectiveRole = target.platformRole === PlatformRole.CLIENT
    ? ProjectMemberRole.VIEWER
    : (role ?? ProjectMemberRole.EDITOR);

  const member = await addMemberDirect({
    projectId,
    userId,
    role: effectiveRole,
    addedById: adminId,
    asAdmin: true,
  });

  if (target.platformRole === PlatformRole.CLIENT) {
    await upsertClientProjectAccess(userId, projectId, clientAccess ?? {});
  }

  return member;
}

export async function updateUserProjectClientAccess(adminId, userId, projectId, clientAccess) {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { platformRole: true },
  });
  if (target?.platformRole !== PlatformRole.CLIENT) {
    throw new HttpError(400, "User is not a client portal account");
  }

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!membership) throw new HttpError(404, "User is not assigned to this project");

  const row = await upsertClientProjectAccess(userId, projectId, clientAccess);

  await logAdminAudit({
    userId: adminId,
    action: "updated_client_access",
    entityType: "user",
    entityId: userId,
    meta: { projectId, clientAccess: serializeClientAccess(row) },
  });

  return serializeClientAccess(row);
}

export async function removeUserFromProject(adminId, userId, projectId) {
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!member) throw new HttpError(404, "User is not a project member");

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { leaderId: true },
  });
  if (project?.leaderId === userId) {
    throw new HttpError(400, "Cannot remove the project leader");
  }

  await prisma.projectMember.delete({ where: { id: member.id } });
  await prisma.clientProjectAccess.deleteMany({ where: { projectId, userId } });

  await logAdminAudit({
    userId: adminId,
    action: "removed_project_member",
    entityType: "user",
    entityId: userId,
    meta: { projectId, role: member.role },
  });
}

export async function listAllProjects({ skip = 0, take = 50 } = {}) {
  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      orderBy: { updatedAt: "desc" },
      skip,
      take,
      include: {
        leader: { select: { id: true, name: true, email: true } },
        teamProjects: { include: { team: { select: { id: true, name: true, slug: true, color: true } } } },
        _count: { select: { members: true, erdTables: true, erdRelations: true, comments: true } },
      },
    }),
    prisma.project.count(),
  ]);
  return {
    total,
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      visibility: p.visibility,
      healthStage: p.healthStage,
      lastActivityAt: p.lastActivityAt,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      leader: p.leader,
      teams: p.teamProjects.map((tp) => tp.team),
      counts: p._count,
    })),
  };
}

export async function listAuditLog({ limit = 50, skip = 0 } = {}) {
  const [items, total] = await Promise.all([
    prisma.adminAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.adminAuditLog.count(),
  ]);
  return { items, total };
}

export async function exportCompanyBackup() {
  const [users, teams, projects, templates] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, name: true, email: true, platformRole: true, isActive: true, createdAt: true },
    }),
    prisma.team.findMany({ include: { members: true, projects: true } }),
    prisma.project.findMany({
      include: {
        members: true,
        teamProjects: true,
        erdTables: { include: { columns: true } },
        erdRelations: true,
        apiGroups: { include: { routes: { include: { parameters: true, responses: true } } } },
      },
    }),
    prisma.projectTemplate.findMany(),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    users,
    teams,
    projects,
    templates,
  };
}
