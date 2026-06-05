import bcrypt from "bcryptjs";
import { PlatformRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { logAdminAudit } from "../../lib/audit.js";
import { enrichUserProfile } from "../../lib/userProfile.js";

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

export async function updateUser(adminId, userId, input) {
  if (adminId === userId && input.isActive === false) {
    throw new HttpError(400, "Cannot deactivate your own account");
  }
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(input.platformRole !== undefined && { platformRole: input.platformRole }),
    },
  });

  await logAdminAudit({
    userId: adminId,
    action: "updated",
    entityType: "user",
    entityId: userId,
    meta: input,
  });

  return enrichUserProfile(user.id);
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
