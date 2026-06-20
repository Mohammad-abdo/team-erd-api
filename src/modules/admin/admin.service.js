import bcrypt from "bcryptjs";
import { PlatformRole, ProjectMemberRole, TeamRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { logAdminAudit } from "../../lib/audit.js";
import { enrichUserProfile } from "../../lib/userProfile.js";
import { serializeClientAccess, upsertClientProjectAccess } from "../../lib/clientPortal.js";
import { signAccessToken } from "../../lib/tokens.js";
import * as teamsService from "../teams/teams.service.js";
import { addMemberDirect, transferProjectLeader } from "../projects/members.service.js";

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

  const directProjectIds = new Set(user.projectMembers.map((m) => m.project.id));
  const teamIds = user.teamMemberships.map((m) => m.team.id);

  const implicitRows = teamIds.length
    ? await prisma.teamProject.findMany({
        where: {
          teamId: { in: teamIds },
          projectId: { notIn: [...directProjectIds] },
        },
        include: {
          project: { select: { id: true, name: true, slug: true, healthStage: true } },
          team: { select: { id: true, name: true, slug: true } },
        },
      })
    : [];

  const clientAccessByProject = new Map(
    user.clientProjectAccess.map((row) => [row.projectId, serializeClientAccess(row)]),
  );

  const projects = user.projectMembers.map((m) => ({
    id: m.project.id,
    name: m.project.name,
    slug: m.project.slug,
    healthStage: m.project.healthStage,
    role: m.role,
    joinedAt: m.joinedAt,
    expiresAt: m.expiresAt,
    accessType: user.platformRole === PlatformRole.CLIENT ? "client" : "direct",
    direct: true,
    clientAccess: clientAccessByProject.get(m.project.id) ?? null,
  }));

  const implicitProjects = implicitRows.map((row) => ({
    id: row.project.id,
    name: row.project.name,
    slug: row.project.slug,
    healthStage: row.project.healthStage,
    role: "VIEWER",
    effectiveRole: "VIEWER",
    accessType: "team_implicit",
    direct: false,
    viaTeam: {
      id: row.team.id,
      name: row.team.name,
      slug: row.team.slug,
    },
  }));

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
    projects,
    implicitProjects,
    accessSummary: [...projects, ...implicitProjects],
  };
}

export async function updateUser(adminId, userId, input) {
  if (adminId === userId && input.isActive === false) {
    throw new HttpError(400, "Cannot deactivate your own account");
  }

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { platformRole: true },
  });
  if (!existing) throw new HttpError(404, "User not found");

  const oldPlatformRole = existing.platformRole;
  const newPlatformRole = input.platformRole ?? oldPlatformRole;

  const data = {
    ...(input.name !== undefined && { name: input.name.trim() }),
    ...(input.isActive !== undefined && { isActive: input.isActive }),
    ...(input.platformRole !== undefined && { platformRole: input.platformRole }),
  };

  if (input.password) {
    data.passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data });

    if (oldPlatformRole === PlatformRole.MEMBER && newPlatformRole === PlatformRole.CLIENT) {
      await tx.teamMember.deleteMany({ where: { userId } });
      await tx.projectMember.updateMany({
        where: { userId, role: { not: ProjectMemberRole.VIEWER } },
        data: { role: ProjectMemberRole.VIEWER },
      });
      await tx.projectPermission.deleteMany({
        where: {
          userId,
          OR: [
            { action: { not: "VIEW" } },
            { resource: "COMMENTS", action: "VIEW" },
          ],
        },
      });
    }
  });

  const auditMeta = { ...input };
  if (auditMeta.password) auditMeta.password = "[reset]";
  if (input.platformRole !== undefined) {
    auditMeta.oldPlatformRole = oldPlatformRole;
    auditMeta.newPlatformRole = newPlatformRole;
  }

  await logAdminAudit({
    userId: adminId,
    action: "updated",
    entityType: "user",
    entityId: userId,
    meta: auditMeta,
  });

  return enrichUserProfile(userId);
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

export async function assignUserToProject(adminId, userId, { projectId, role, clientAccess, expiresAt }) {
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
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  });

  if (target.platformRole === PlatformRole.CLIENT) {
    await upsertClientProjectAccess(userId, projectId, clientAccess ?? {}, {
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });
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

export async function transferUserToProjectLeader(adminId, userId, projectId) {
  return transferProjectLeader({
    projectId,
    newLeaderUserId: userId,
    actorId: adminId,
    asAdmin: true,
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

export async function listAuditLog({
  limit = 50,
  skip = 0,
  action,
  entityType,
  filter,
} = {}) {
  const where = {};
  if (action) where.action = action;
  if (entityType) where.entityType = entityType;
  if (filter === "user_changes") {
    where.entityType = "user";
  } else if (filter === "role_changes") {
    where.OR = [
      { action: "updated", entityType: "user" },
      { action: "transferred_project_leader" },
      { action: "added_member", entityType: "team" },
      { action: "removed_member", entityType: "team" },
      { action: "removed_project_member" },
      { action: "updated_client_access" },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.adminAuditLog.count({ where }),
  ]);
  return { items, total };
}

export async function listAllInvitations({ status = "pending" } = {}) {
  if (status !== "pending") {
    throw new HttpError(400, "Only pending invitations are supported");
  }
  const invitations = await prisma.projectInvitation.findMany({
    where: { acceptedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    include: {
      project: { select: { id: true, name: true, slug: true } },
      invitedBy: { select: { id: true, name: true, email: true } },
    },
  });
  return { invitations };
}

export async function bulkUserAction(adminId, { userIds, action, payload = {} }) {
  if (action === "deactivate") {
    await prisma.user.updateMany({
      where: { id: { in: userIds.filter((id) => id !== adminId) } },
      data: { isActive: false },
    });
    await logAdminAudit({
      userId: adminId,
      action: "bulk_deactivated",
      entityType: "user",
      meta: { userIds, count: userIds.length },
    });
    return { updated: userIds.length };
  }

  if (action === "assignTeam") {
    const { teamId, role } = payload;
    if (!teamId) throw new HttpError(400, "teamId required");
    let count = 0;
    for (const userId of userIds) {
      try {
        await assignUserToTeam(adminId, userId, { teamId, role: role ?? TeamRole.MEMBER });
        count += 1;
      } catch {
        // skip users that cannot be assigned
      }
    }
    return { updated: count };
  }

  throw new HttpError(400, "Unknown bulk action");
}

export async function startImpersonation(adminId, targetUserId) {
  if (adminId === targetUserId) {
    throw new HttpError(400, "Cannot impersonate yourself");
  }
  const [admin, target] = await Promise.all([
    prisma.user.findUnique({ where: { id: adminId }, select: { platformRole: true, isActive: true } }),
    prisma.user.findUnique({ where: { id: targetUserId }, select: { platformRole: true, isActive: true, email: true } }),
  ]);
  if (!admin?.isActive || admin.platformRole !== PlatformRole.SUPER_ADMIN) {
    throw new HttpError(403, "Super admin access required");
  }
  if (!target?.isActive) throw new HttpError(404, "User not found");
  if (target.platformRole === PlatformRole.SUPER_ADMIN) {
    throw new HttpError(400, "Cannot impersonate another super admin");
  }

  const accessToken = signAccessToken({
    sub: targetUserId,
    email: target.email,
    impersonatorSub: adminId,
  });

  await logAdminAudit({
    userId: adminId,
    action: "impersonation_started",
    entityType: "user",
    entityId: targetUserId,
  });

  const user = await enrichUserProfile(targetUserId);
  return { accessToken, user, impersonating: { userId: targetUserId, adminId } };
}

export async function stopImpersonation(adminId) {
  await logAdminAudit({
    userId: adminId,
    action: "impersonation_stopped",
    entityType: "user",
  });
  const admin = await prisma.user.findUnique({
    where: { id: adminId },
    select: { id: true, email: true },
  });
  const accessToken = signAccessToken({ sub: admin.id, email: admin.email });
  const user = await enrichUserProfile(admin.id);
  return { accessToken, user };
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
