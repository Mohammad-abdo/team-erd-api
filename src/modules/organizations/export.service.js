import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { loadAdminActor, userWhereForAdmin, assertTeamInOrgScope } from "../../lib/adminScope.js";
import { DEFAULT_ORG_ID } from "../../lib/orgScope.js";

const ENTITIES = new Set([
  "users",
  "teams",
  "projects",
  "project-tasks",
  "daily-tasks",
  "shifts",
  "focus",
  "ratings",
  "daily-reports",
]);

function orgIdForActor(actor) {
  return actor.user.organizationId ?? DEFAULT_ORG_ID;
}

function orgWhereForActor(actor) {
  return actor.isSuperAdmin ? {} : { organizationId: orgIdForActor(actor) };
}

function parseMonth(month) {
  if (!month) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(String(month));
  if (!match) throw new HttpError(400, "month must be YYYY-MM");
  const year = Number(match[1]);
  const mon = Number(match[2]);
  if (mon < 1 || mon > 12) throw new HttpError(400, "month must be YYYY-MM");
  return {
    start: new Date(Date.UTC(year, mon - 1, 1)),
    end: new Date(Date.UTC(year, mon, 1)),
  };
}

function csvEscape(value) {
  if (value == null) return "";
  const s = value instanceof Date ? value.toISOString() : String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(rows) {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const header = keys.join(",");
  const lines = rows.map((row) => keys.map((key) => csvEscape(row[key])).join(","));
  return [header, ...lines].join("\n");
}

function flattenRow(row, prefix = "") {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    const col = prefix ? `${prefix}_${key}` : key;
    if (value && typeof value === "object" && !(value instanceof Date) && !Array.isArray(value)) {
      Object.assign(out, flattenRow(value, col));
    } else if (Array.isArray(value)) {
      out[col] = JSON.stringify(value);
    } else {
      out[col] = value;
    }
  }
  return out;
}

async function scopedUserIds(actor, { teamId, userId } = {}) {
  if (userId) {
    const user = await prisma.user.findFirst({
      where: { id: userId, ...userWhereForAdmin(actor) },
      select: { id: true },
    });
    if (!user) throw new HttpError(404, "User not found in organization scope");
    return [user.id];
  }

  if (teamId) {
    await assertTeamInOrgScope(actor, teamId);
    const members = await prisma.teamMember.findMany({
      where: { teamId },
      select: { userId: true },
    });
    return members.map((m) => m.userId);
  }

  return null;
}

export async function exportOrganizationFull(actorId) {
  const actor = await loadAdminActor(actorId);
  const orgWhere = orgWhereForActor(actor);
  const userWhere = userWhereForAdmin(actor);
  const orgId = actor.isSuperAdmin ? null : orgIdForActor(actor);

  const userIds = actor.isSuperAdmin
    ? null
    : (await prisma.user.findMany({ where: userWhere, select: { id: true } })).map((u) => u.id);

  const teamIds = actor.isSuperAdmin
    ? null
    : (await prisma.team.findMany({ where: orgWhere, select: { id: true } })).map((t) => t.id);

  const projectIds = actor.isSuperAdmin
    ? null
    : (await prisma.project.findMany({ where: orgWhere, select: { id: true } })).map((p) => p.id);

  const [
    users,
    teams,
    projects,
    projectTasks,
    dailyTasks,
    shifts,
    focus,
    ratings,
    dailyReports,
  ] = await Promise.all([
    prisma.user.findMany({
      where: userWhere,
      select: {
        id: true,
        name: true,
        email: true,
        platformRole: true,
        isActive: true,
        organizationId: true,
        createdAt: true,
        teamMemberships: {
          include: { team: { select: { id: true, name: true, slug: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.team.findMany({
      where: orgWhere,
      include: { members: true, projects: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.project.findMany({
      where: orgWhere,
      include: {
        members: true,
        teamProjects: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.projectTask.findMany({
      where: projectIds ? { projectId: { in: projectIds } } : {},
      include: { assignees: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.dailyTask.findMany({
      where: teamIds ? { teamId: { in: teamIds } } : {},
      orderBy: { taskDate: "desc" },
    }),
    prisma.workShift.findMany({
      where: orgWhere.organizationId ? { organizationId: orgWhere.organizationId } : {},
      orderBy: { startedAt: "desc" },
    }),
    prisma.todayFocusItem.findMany({
      where: userIds ? { userId: { in: userIds } } : {},
      orderBy: [{ focusDate: "desc" }, { sortOrder: "asc" }],
    }),
    prisma.memberRating.findMany({
      where: teamIds
        ? {
            OR: [
              { teamId: { in: teamIds } },
              ...(projectIds ? [{ projectId: { in: projectIds } }] : []),
            ],
          }
        : {},
      orderBy: { createdAt: "desc" },
    }),
    prisma.dailyReport.findMany({
      where: teamIds
        ? {
            OR: [
              { teamId: { in: teamIds } },
              { userId: userIds ? { in: userIds } : undefined },
            ],
          }
        : {},
      orderBy: { reportDate: "desc" },
    }),
  ]);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    organizationId: orgId,
    counts: {
      users: users.length,
      teams: teams.length,
      projects: projects.length,
      projectTasks: projectTasks.length,
      dailyTasks: dailyTasks.length,
      shifts: shifts.length,
      focus: focus.length,
      ratings: ratings.length,
      dailyReports: dailyReports.length,
    },
    users,
    teams,
    projects,
    projectTasks,
    dailyTasks,
    shifts,
    focus,
    ratings,
    dailyReports,
  };
}

async function exportUsers(actor, filters) {
  const where = { ...userWhereForAdmin(actor) };
  const userIds = await scopedUserIds(actor, filters);
  if (userIds) where.id = { in: userIds };

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      name: true,
      email: true,
      platformRole: true,
      isActive: true,
      organizationId: true,
      createdAt: true,
      teamMemberships: {
        include: { team: { select: { id: true, name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    platformRole: u.platformRole,
    isActive: u.isActive,
    organizationId: u.organizationId,
    createdAt: u.createdAt,
    teams: u.teamMemberships.map((m) => `${m.team.name}:${m.role}`).join("; "),
  }));
}

async function exportTeams(actor, filters) {
  const where = { ...orgWhereForActor(actor) };
  if (filters.teamId) {
    await assertTeamInOrgScope(actor, filters.teamId);
    where.id = filters.teamId;
  }

  const teams = await prisma.team.findMany({
    where,
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
      projects: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return teams.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    organizationId: t.organizationId,
    memberCount: t.members.length,
    projectCount: t.projects.length,
    createdAt: t.createdAt,
  }));
}

async function exportProjects(actor, filters) {
  const where = { ...orgWhereForActor(actor) };
  if (filters.teamId) {
    await assertTeamInOrgScope(actor, filters.teamId);
    where.teamProjects = { some: { teamId: filters.teamId } };
  }

  return prisma.project.findMany({
    where,
    select: {
      id: true,
      name: true,
      slug: true,
      organizationId: true,
      visibility: true,
      healthStage: true,
      leaderId: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

async function exportProjectTasks(actor, filters) {
  const orgWhere = orgWhereForActor(actor);
  const monthRange = parseMonth(filters.month);
  const userIds = await scopedUserIds(actor, filters);

  const where = {
    project: orgWhere.organizationId ? { organizationId: orgWhere.organizationId } : {},
  };
  if (filters.teamId) {
    await assertTeamInOrgScope(actor, filters.teamId);
    where.project = {
      ...where.project,
      teamProjects: { some: { teamId: filters.teamId } },
    };
  }
  if (monthRange) {
    where.createdAt = { gte: monthRange.start, lt: monthRange.end };
  }
  if (userIds) {
    where.assignees = { some: { userId: { in: userIds } } };
  }

  const tasks = await prisma.projectTask.findMany({
    where,
    include: {
      project: { select: { id: true, name: true } },
      assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return tasks.map((t) => ({
    id: t.id,
    projectId: t.projectId,
    projectName: t.project.name,
    title: t.title,
    status: t.status,
    priority: t.priority,
    progress: t.progress,
    dueDate: t.dueDate,
    createdAt: t.createdAt,
    completedAt: t.completedAt,
    assignees: t.assignees.map((a) => a.user.email).join("; "),
  }));
}

async function exportDailyTasks(actor, filters) {
  const orgWhere = orgWhereForActor(actor);
  const monthRange = parseMonth(filters.month);
  const userIds = await scopedUserIds(actor, filters);

  const where = {};
  if (orgWhere.organizationId) {
    where.team = { organizationId: orgWhere.organizationId };
  }
  if (filters.teamId) {
    await assertTeamInOrgScope(actor, filters.teamId);
    where.teamId = filters.teamId;
  }
  if (monthRange) {
    where.taskDate = { gte: monthRange.start, lt: monthRange.end };
  }
  if (userIds) {
    where.assigneeId = { in: userIds };
  }

  return prisma.dailyTask.findMany({
    where,
    orderBy: [{ taskDate: "desc" }, { createdAt: "desc" }],
  });
}

async function exportShifts(actor, filters) {
  const orgWhere = orgWhereForActor(actor);
  const monthRange = parseMonth(filters.month);
  const userIds = await scopedUserIds(actor, filters);

  const where = orgWhere.organizationId ? { organizationId: orgWhere.organizationId } : {};
  if (monthRange) {
    where.startedAt = { gte: monthRange.start, lt: monthRange.end };
  }
  if (userIds) {
    where.userId = { in: userIds };
  }

  const shifts = await prisma.workShift.findMany({
    where,
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { startedAt: "desc" },
  });

  return shifts.map((s) => ({
    id: s.id,
    userId: s.userId,
    userName: s.user.name,
    userEmail: s.user.email,
    organizationId: s.organizationId,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    note: s.note,
  }));
}

async function exportFocus(actor, filters) {
  const monthRange = parseMonth(filters.month);
  const userIds = await scopedUserIds(actor, filters);

  const where = {};
  if (!actor.isSuperAdmin) {
    const ids = userIds ?? (await prisma.user.findMany({
      where: userWhereForAdmin(actor),
      select: { id: true },
    })).map((u) => u.id);
    where.userId = { in: ids };
  } else if (userIds) {
    where.userId = { in: userIds };
  }
  if (monthRange) {
    where.focusDate = { gte: monthRange.start, lt: monthRange.end };
  }

  const items = await prisma.todayFocusItem.findMany({
    where,
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: [{ focusDate: "desc" }, { sortOrder: "asc" }],
  });

  return items.map((item) => ({
    id: item.id,
    userId: item.userId,
    userName: item.user.name,
    userEmail: item.user.email,
    focusDate: item.focusDate,
    title: item.title,
    sortOrder: item.sortOrder,
    isDone: item.isDone,
    taskId: item.taskId,
    createdAt: item.createdAt,
  }));
}

async function exportRatings(actor, filters) {
  const orgWhere = orgWhereForActor(actor);
  const monthRange = parseMonth(filters.month);
  const userIds = await scopedUserIds(actor, filters);

  const teamIds = orgWhere.organizationId
    ? (await prisma.team.findMany({ where: orgWhere, select: { id: true } })).map((t) => t.id)
    : null;

  const where = {};
  if (teamIds) {
    where.OR = [
      { teamId: { in: teamIds } },
      { project: { organizationId: orgWhere.organizationId } },
    ];
  }
  if (filters.teamId) {
    await assertTeamInOrgScope(actor, filters.teamId);
    where.teamId = filters.teamId;
  }
  if (monthRange) {
    where.createdAt = { gte: monthRange.start, lt: monthRange.end };
  }
  if (userIds) {
    where.userId = { in: userIds };
  }

  const ratings = await prisma.memberRating.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, email: true } },
      reviewer: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return ratings.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.user.name,
    reviewerId: r.reviewerId,
    reviewerName: r.reviewer.name,
    teamId: r.teamId,
    projectId: r.projectId,
    score: r.score,
    comment: r.comment,
    createdAt: r.createdAt,
  }));
}

async function exportDailyReports(actor, filters) {
  const orgWhere = orgWhereForActor(actor);
  const monthRange = parseMonth(filters.month);
  const userIds = await scopedUserIds(actor, filters);

  const teamIds = orgWhere.organizationId
    ? (await prisma.team.findMany({ where: orgWhere, select: { id: true } })).map((t) => t.id)
    : null;

  const where = {};
  if (teamIds) {
    where.OR = [
      { teamId: { in: teamIds } },
      { user: userWhereForAdmin(actor) },
    ];
  }
  if (filters.teamId) {
    await assertTeamInOrgScope(actor, filters.teamId);
    where.teamId = filters.teamId;
  }
  if (monthRange) {
    where.reportDate = { gte: monthRange.start, lt: monthRange.end };
  }
  if (userIds) {
    where.userId = { in: userIds };
  }

  const reports = await prisma.dailyReport.findMany({
    where,
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { reportDate: "desc" },
  });

  return reports.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.user.name,
    teamId: r.teamId,
    projectId: r.projectId,
    scope: r.scope,
    reportDate: r.reportDate,
    summary: r.summary,
    tasksDone: r.tasksDone,
    blockers: r.blockers,
    nextPlan: r.nextPlan,
    hoursWorked: r.hoursWorked,
    mood: r.mood,
    createdAt: r.createdAt,
  }));
}

const ENTITY_EXPORTERS = {
  users: exportUsers,
  teams: exportTeams,
  projects: exportProjects,
  "project-tasks": exportProjectTasks,
  "daily-tasks": exportDailyTasks,
  shifts: exportShifts,
  focus: exportFocus,
  ratings: exportRatings,
  "daily-reports": exportDailyReports,
};

export async function exportOrganizationEntity(actorId, entity, options = {}) {
  if (!ENTITIES.has(entity)) {
    throw new HttpError(400, `Unknown export entity: ${entity}`);
  }

  const format = options.format === "csv" ? "csv" : "json";
  const actor = await loadAdminActor(actorId);
  const filters = {
    month: options.month,
    teamId: options.teamId,
    userId: options.userId,
  };

  const rows = await ENTITY_EXPORTERS[entity](actor, filters);

  if (format === "csv") {
    const flatRows = rows.map((row) => flattenRow(row));
    return {
      format: "csv",
      entity,
      contentType: "text/csv; charset=utf-8",
      filename: `${entity}-export.csv`,
      body: toCsv(flatRows),
    };
  }

  return {
    format: "json",
    entity,
    contentType: "application/json; charset=utf-8",
    filename: `${entity}-export.json`,
    body: { entity, count: rows.length, rows },
  };
}
