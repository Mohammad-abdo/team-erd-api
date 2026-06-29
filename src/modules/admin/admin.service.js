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
import {
  loadAdminActor,
  assertUserInOrgScope,
  assertTeamInOrgScope,
  assertProjectInOrgScope,
  assertAssignablePlatformRole,
  userWhereForAdmin,
} from "../../lib/adminScope.js";
import { DEFAULT_ORG_ID } from "../../lib/orgScope.js";

const SALT_ROUNDS = 10;

export async function getPlatformStats(adminId) {
  const actor = await loadAdminActor(adminId);
  const userWhere = userWhereForAdmin(actor);
  const teamWhere = actor.isSuperAdmin ? {} : actor.orgWhere;
  const projectWhere = actor.isSuperAdmin ? {} : actor.orgWhere;

  const orgUserIds = actor.isSuperAdmin
    ? null
    : (await prisma.user.findMany({ where: userWhere, select: { id: true } })).map((u) => u.id);

  const [users, teams, projects, activeUsers, recentAudit] = await Promise.all([
    prisma.user.count({ where: userWhere }),
    prisma.team.count({ where: teamWhere }),
    prisma.project.count({ where: projectWhere }),
    prisma.user.count({ where: { ...userWhere, isActive: true } }),
    prisma.adminAuditLog.findMany({
      where: orgUserIds ? { userId: { in: orgUserIds } } : {},
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
  ]);
  return { users, teams, projects, activeUsers, recentAudit };
}

export async function listAllUsers(adminId, { skip = 0, take = 50 } = {}) {
  const actor = await loadAdminActor(adminId);
  const where = userWhereForAdmin(actor);
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
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
        organizationId: true,
        organization: { select: { id: true, name: true, slug: true } },
        teamMemberships: {
          include: { team: { select: { id: true, name: true, slug: true, color: true } } },
        },
        _count: { select: { projectMembers: true } },
      },
    }),
    prisma.user.count({ where }),
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
      organizationId: u.organizationId,
      organization: u.organization,
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
  const actor = await loadAdminActor(adminId);
  const role = input.platformRole ?? PlatformRole.MEMBER;
  assertAssignablePlatformRole(actor, role);

  const normalized = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (existing) throw new HttpError(409, "Email already registered");

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const organizationId = actor.isSuperAdmin
    ? (input.organizationId ?? null)
    : (actor.user.organizationId ?? DEFAULT_ORG_ID);

  const user = await prisma.user.create({
    data: {
      name: input.name.trim(),
      email: normalized,
      passwordHash,
      platformRole: role,
      organizationId,
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

export async function getUserDetail(adminId, userId) {
  const actor = await loadAdminActor(adminId);
  await assertUserInOrgScope(actor, userId);

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
  const actor = await loadAdminActor(adminId);
  await assertUserInOrgScope(actor, userId);

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
  if (input.platformRole !== undefined) {
    assertAssignablePlatformRole(actor, newPlatformRole);
  }

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
  const actor = await loadAdminActor(adminId);
  await assertUserInOrgScope(actor, userId);
  await assertTeamInOrgScope(actor, teamId);

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
  const actor = await loadAdminActor(adminId);
  await assertUserInOrgScope(actor, userId);
  await assertTeamInOrgScope(actor, teamId);
  await teamsService.removeTeamMember(adminId, teamId, userId);
}

export async function assignUserToProject(adminId, userId, { projectId, role, clientAccess, expiresAt }) {
  const actor = await loadAdminActor(adminId);
  await assertUserInOrgScope(actor, userId);
  await assertProjectInOrgScope(actor, projectId);

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
  const actor = await loadAdminActor(adminId);
  await assertUserInOrgScope(actor, userId);
  await assertProjectInOrgScope(actor, projectId);

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
  const actor = await loadAdminActor(adminId);
  await assertUserInOrgScope(actor, userId);
  await assertProjectInOrgScope(actor, projectId);

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
  const actor = await loadAdminActor(adminId);
  await assertUserInOrgScope(actor, userId);
  await assertProjectInOrgScope(actor, projectId);
  return transferProjectLeader({
    projectId,
    newLeaderUserId: userId,
    actorId: adminId,
    asAdmin: true,
  });
}

export async function listAllProjects(adminId, { skip = 0, take = 50 } = {}) {
  const actor = await loadAdminActor(adminId);
  const where = actor.isSuperAdmin ? {} : actor.orgWhere;
  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip,
      take,
      include: {
        leader: { select: { id: true, name: true, email: true } },
        organization: { select: { id: true, name: true, slug: true } },
        teamProjects: { include: { team: { select: { id: true, name: true, slug: true, color: true } } } },
        _count: { select: { members: true, erdTables: true, erdRelations: true, comments: true } },
      },
    }),
    prisma.project.count({ where }),
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
      organization: p.organization,
      teams: p.teamProjects.map((tp) => tp.team),
      counts: p._count,
    })),
  };
}

export async function listAuditLog(adminId, {
  limit = 50,
  skip = 0,
  action,
  entityType,
  filter,
} = {}) {
  const actor = await loadAdminActor(adminId);
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

  if (!actor.isSuperAdmin) {
    const orgUserIds = (await prisma.user.findMany({
      where: userWhereForAdmin(actor),
      select: { id: true },
    })).map((u) => u.id);
    where.userId = { in: orgUserIds };
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

export async function listAllInvitations(adminId, { status = "pending" } = {}) {
  const actor = await loadAdminActor(adminId);
  if (status !== "pending") {
    throw new HttpError(400, "Only pending invitations are supported");
  }
  const projectWhere = actor.isSuperAdmin ? {} : actor.orgWhere;
  const invitations = await prisma.projectInvitation.findMany({
    where: {
      acceptedAt: null,
      expiresAt: { gt: new Date() },
      project: projectWhere,
    },
    orderBy: { expiresAt: "desc" },
    include: {
      project: { select: { id: true, name: true, slug: true } },
    },
  });
  return { invitations };
}

export async function bulkUserAction(adminId, { userIds, action, payload = {} }) {
  const actor = await loadAdminActor(adminId);
  const scopedIds = [];
  for (const id of userIds) {
    try {
      await assertUserInOrgScope(actor, id);
      scopedIds.push(id);
    } catch {
      // skip out-of-scope users
    }
  }

  if (action === "deactivate") {
    await prisma.user.updateMany({
      where: { id: { in: scopedIds.filter((id) => id !== adminId) } },
      data: { isActive: false },
    });
    await logAdminAudit({
      userId: adminId,
      action: "bulk_deactivated",
      entityType: "user",
      meta: { userIds: scopedIds, count: scopedIds.length },
    });
    return { updated: scopedIds.length };
  }

  if (action === "assignTeam") {
    const { teamId, role } = payload;
    if (!teamId) throw new HttpError(400, "teamId required");
    let count = 0;
    for (const userId of scopedIds) {
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
  const [
    users,
    teams,
    projects,
    templates,
    platformSettings,
    projectTasks,
    dailyTasks,
    clientProjectAccess,
    notifications,
    adminAuditLogs,
    memberRatings,
    scheduledReports,
    customReportDefinitions,
    accessRequests,
    organizations,
    meetingReminders,
  ] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        platformRole: true,
        isActive: true,
        notificationPrefs: true,
        organizationId: true,
        createdAt: true,
      },
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
    prisma.platformSetting.findMany(),
    prisma.projectTask.findMany({
      include: { assignees: true, progressLogs: true },
    }),
    prisma.dailyTask.findMany(),
    prisma.clientProjectAccess.findMany(),
    prisma.notification.findMany({ take: 50000, orderBy: { createdAt: "desc" } }),
    prisma.adminAuditLog.findMany({ take: 50000, orderBy: { createdAt: "desc" } }),
    prisma.memberRating.findMany(),
    prisma.scheduledReport.findMany({ include: { runs: { take: 100, orderBy: { ranAt: "desc" } } } }),
    prisma.customReportDefinition.findMany(),
    prisma.accessRequest.findMany(),
    prisma.organization.findMany(),
    prisma.meetingReminder.findMany(),
  ]);

  const counts = {
    users: users.length,
    teams: teams.length,
    projects: projects.length,
    templates: templates.length,
    projectTasks: projectTasks.length,
    dailyTasks: dailyTasks.length,
    clientProjectAccess: clientProjectAccess.length,
    notifications: notifications.length,
    adminAuditLogs: adminAuditLogs.length,
    memberRatings: memberRatings.length,
    scheduledReports: scheduledReports.length,
    customReportDefinitions: customReportDefinitions.length,
    accessRequests: accessRequests.length,
    organizations: organizations.length,
    meetingReminders: meetingReminders.length,
  };

  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    counts,
    users,
    teams,
    projects,
    templates,
    platformSettings,
    projectTasks,
    dailyTasks,
    clientProjectAccess,
    notifications,
    adminAuditLogs,
    memberRatings,
    scheduledReports,
    customReportDefinitions,
    accessRequests,
    organizations,
    meetingReminders,
  };
}
