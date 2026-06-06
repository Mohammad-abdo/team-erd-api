import { prisma } from "../../lib/prisma.js";
import { formatDriftReportRow } from "../import/driftReports.service.js";

/**
 * Latest drift status for every project the user belongs to.
 */
export async function listPortfolioDriftSummaries(userId) {
  const memberships = await prisma.projectMember.findMany({
    where: { userId },
    include: {
      project: {
        select: { id: true, name: true, slug: true, healthStage: true },
      },
    },
    orderBy: { joinedAt: "desc" },
  });

  const projectIds = memberships.map((m) => m.project.id);
  if (!projectIds.length) return [];

  const [latestReports, schedules, historyCounts] = await Promise.all([
    prisma.projectDriftReport.findMany({
      where: { projectId: { in: projectIds } },
      orderBy: { createdAt: "desc" },
      distinct: ["projectId"],
      include: {
        checkedBy: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.projectDriftSchedule.findMany({
      where: { projectId: { in: projectIds } },
      select: {
        projectId: true,
        enabled: true,
        utcDay: true,
        utcHour: true,
        lastRunAt: true,
        lastRunStatus: true,
        lastIssueCount: true,
      },
    }),
    prisma.projectDriftReport.groupBy({
      by: ["projectId"],
      where: { projectId: { in: projectIds } },
      _count: { id: true },
    }),
  ]);

  const reportByProject = Object.fromEntries(
    latestReports.map((row) => [row.projectId, formatDriftReportRow(row)]),
  );
  const scheduleByProject = Object.fromEntries(schedules.map((s) => [s.projectId, s]));
  const countByProject = Object.fromEntries(historyCounts.map((c) => [c.projectId, c._count.id]));

  return memberships.map((m) => {
    const latest = reportByProject[m.project.id] ?? null;
    const schedule = scheduleByProject[m.project.id] ?? null;
    let status = "never_checked";
    if (latest) {
      status = latest.inSync ? "in_sync" : "drift";
    }

    return {
      project: m.project,
      myRole: m.role,
      status,
      latestDrift: latest,
      historyCount: countByProject[m.project.id] ?? 0,
      schedule: schedule
        ? {
            enabled: schedule.enabled,
            utcDay: schedule.utcDay,
            utcHour: schedule.utcHour,
            lastRunAt: schedule.lastRunAt,
            lastRunStatus: schedule.lastRunStatus,
            lastIssueCount: schedule.lastIssueCount,
          }
        : null,
    };
  });
}
