import { prisma } from "../../lib/prisma.js";

function startOfDaysAgo(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function formatDay(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string") return value.slice(0, 10);
  return String(value);
}

export async function getPlatformUsage({ days = 30 } = {}) {
  const since = startOfDaysAgo(days);
  const weekAgo = startOfDaysAgo(7);

  const [
    users,
    activeUsers,
    projects,
    teams,
    tables,
    relations,
    apiRoutes,
    comments,
    tasks,
    driftReports,
    recentActivity,
    activeUsers7d,
    activeUsers30d,
    activityByDay,
    activeUsersByDay,
    topProjectGroups,
    entityGroups,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.project.count(),
    prisma.team.count(),
    prisma.erdTable.count(),
    prisma.erdRelation.count(),
    prisma.apiRoute.count(),
    prisma.comment.count(),
    prisma.projectTask.count(),
    prisma.projectDriftReport.count({ where: { createdAt: { gte: since } } }),
    prisma.activityLog.count({ where: { createdAt: { gte: since } } }),
    prisma.activityLog.findMany({
      where: { createdAt: { gte: weekAgo }, userId: { not: null } },
      distinct: ["userId"],
      select: { userId: true },
    }),
    prisma.activityLog.findMany({
      where: { createdAt: { gte: since }, userId: { not: null } },
      distinct: ["userId"],
      select: { userId: true },
    }),
    prisma.$queryRaw`
      SELECT DATE(created_at) AS day, COUNT(*) AS count
      FROM activity_logs
      WHERE created_at >= ${since}
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `,
    prisma.$queryRaw`
      SELECT DATE(created_at) AS day, COUNT(DISTINCT user_id) AS users
      FROM activity_logs
      WHERE created_at >= ${since} AND user_id IS NOT NULL
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `,
    prisma.activityLog.groupBy({
      by: ["projectId"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { projectId: "desc" } },
      take: 8,
    }),
    prisma.activityLog.groupBy({
      by: ["entityType"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { entityType: "desc" } },
    }),
  ]);

  const topProjectIds = topProjectGroups.map((row) => row.projectId);
  const topProjectRows = topProjectIds.length
    ? await prisma.project.findMany({
        where: { id: { in: topProjectIds } },
        select: { id: true, name: true, slug: true },
      })
    : [];
  const projectNameById = Object.fromEntries(topProjectRows.map((p) => [p.id, p]));

  return {
    periodDays: days,
    generatedAt: new Date().toISOString(),
    totals: {
      users,
      activeUsers,
      projects,
      teams,
      tables,
      relations,
      apiRoutes,
      comments,
      tasks,
      driftChecks: driftReports,
      activityEvents: recentActivity,
      activeUsers7d: activeUsers7d.length,
      activeUsers30d: activeUsers30d.length,
    },
    activityByDay: activityByDay.map((row) => ({
      day: formatDay(row.day),
      count: Number(row.count ?? 0),
    })),
    activeUsersByDay: activeUsersByDay.map((row) => ({
      day: formatDay(row.day),
      users: Number(row.users ?? 0),
    })),
    topProjects: topProjectGroups.map((row) => ({
      projectId: row.projectId,
      name: projectNameById[row.projectId]?.name ?? row.projectId,
      slug: projectNameById[row.projectId]?.slug ?? null,
      activityCount: row._count._all,
    })),
    entityBreakdown: entityGroups.map((row) => ({
      entityType: row.entityType,
      count: row._count._all,
    })),
  };
}
