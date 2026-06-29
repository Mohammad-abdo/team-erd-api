import { TaskStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { canSuperviseUser, getManagedMemberUserIds } from "../../lib/teamHierarchy.js";
import { loadUserContext } from "../../lib/orgScope.js";
import { getProgressInsights } from "../progress/progress.service.js";

function parseMonth(month) {
  if (!month) {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth() + 1;
    return {
      month: `${y}-${String(m).padStart(2, "0")}`,
      from: new Date(Date.UTC(y, m - 1, 1)),
      to: new Date(Date.UTC(y, m, 1)),
    };
  }

  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new HttpError(400, "month must be YYYY-MM");
  const year = Number(match[1]);
  const mon = Number(match[2]);
  if (mon < 1 || mon > 12) throw new HttpError(400, "Invalid month");

  return {
    month,
    from: new Date(Date.UTC(year, mon - 1, 1)),
    to: new Date(Date.UTC(year, mon, 1)),
  };
}

function shiftHours(shift) {
  const end = shift.endedAt ? new Date(shift.endedAt) : new Date(); // open shifts use current time
  const start = new Date(shift.startedAt);
  return Math.max(0, (end.getTime() - start.getTime()) / 3600000);
}

function isoWeekKey(date) {
  const d = new Date(date);
  d.setUTCHours(12, 0, 0, 0);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}


async function assertCanViewPerformance(viewerId, targetUserId) {
  if (viewerId === targetUserId) return { isSelf: true };

  const viewer = await loadUserContext(viewerId);
  const allowed = await canSuperviseUser(viewerId, targetUserId, viewer);
  if (!allowed) {
    throw new HttpError(403, "You do not have access to this performance data");
  }
  return { isSelf: false };
}

async function sharedTeamContext(viewerId, targetUserId) {
  const [viewerTeams, targetTeams] = await Promise.all([
    prisma.teamMember.findMany({
      where: { userId: viewerId },
      select: { teamId: true, team: { select: { id: true, name: true, color: true } } },
    }),
    prisma.teamMember.findMany({
      where: { userId: targetUserId },
      select: { teamId: true },
    }),
  ]);
  const targetSet = new Set(targetTeams.map((t) => t.teamId));
  return viewerTeams
    .filter((t) => targetSet.has(t.teamId))
    .map((t) => t.team);
}

export async function aggregateMonthlyKpis(userId, { from, to }) {
  const now = new Date();

  const [
    projectTasks,
    dailyTasks,
    shifts,
    focusItems,
    ratings,
    reports,
  ] = await Promise.all([
    prisma.projectTask.findMany({
      where: { assignees: { some: { userId } } },
      select: {
        id: true,
        status: true,
        progress: true,
        dueDate: true,
        completedAt: true,
      },
    }),
    prisma.dailyTask.findMany({
      where: {
        assigneeId: userId,
        taskDate: { gte: from, lt: to },
      },
      select: { id: true, status: true, taskDate: true },
    }),
    prisma.workShift.findMany({
      where: {
        userId,
        startedAt: { gte: from, lt: to },
      },
      select: { id: true, startedAt: true, endedAt: true },
    }),
    prisma.todayFocusItem.findMany({
      where: {
        userId,
        focusDate: { gte: from, lt: to },
      },
      select: { id: true, isDone: true, focusDate: true },
    }),
    prisma.memberRating.findMany({
      where: {
        userId,
        createdAt: { gte: from, lt: to },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        score: true,
        comment: true,
        createdAt: true,
        reviewer: { select: { id: true, name: true, avatar: true } },
        team: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
      },
    }),
    prisma.dailyReport.findMany({
      where: {
        userId,
        reportDate: { gte: from, lt: to },
      },
      select: { id: true, blockers: true, reportDate: true },
    }),
  ]);

  const completedInMonth = projectTasks.filter(
    (t) => t.status === TaskStatus.DONE
      && t.completedAt
      && t.completedAt >= from
      && t.completedAt < to,
  );
  const activeTasks = projectTasks.filter((t) => t.status !== TaskStatus.DONE);
  const overdueTasks = activeTasks.filter(
    (t) => t.dueDate && new Date(t.dueDate) < now,
  );
  const completionDenominator = completedInMonth.length + activeTasks.length;
  const avgProgress = activeTasks.length
    ? Math.round(activeTasks.reduce((sum, t) => sum + (t.progress ?? 0), 0) / activeTasks.length)
    : (completedInMonth.length ? 100 : 0);

  const dailyCompleted = dailyTasks.filter((t) => t.status === TaskStatus.DONE).length;
  const dailyPending = dailyTasks.length - dailyCompleted;

  let totalShiftHours = 0;
  const shiftDays = new Set();
  for (const shift of shifts) {
    totalShiftHours += shiftHours(shift);
    shiftDays.add(new Date(shift.startedAt).toISOString().slice(0, 10));
  }

  const focusDone = focusItems.filter((f) => f.isDone).length;
  const focusByWeek = new Map();
  for (const item of focusItems) {
    const key = isoWeekKey(item.focusDate);
    const row = focusByWeek.get(key) ?? { week: key, total: 0, done: 0 };
    row.total += 1;
    if (item.isDone) row.done += 1;
    focusByWeek.set(key, row);
  }

  const ratingsAvg = ratings.length
    ? Math.round((ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length) * 10) / 10
    : null;

  const reportsWithBlockers = reports.filter((r) => r.blockers?.trim()).length;

  return {
    projectTasks: {
      completed: completedInMonth.length,
      active: activeTasks.length,
      overdue: overdueTasks.length,
      completionRate: completionDenominator
        ? Math.round((completedInMonth.length / completionDenominator) * 100)
        : 0,
      avgProgress,
    },
    dailyTasks: {
      completed: dailyCompleted,
      pending: dailyPending,
      total: dailyTasks.length,
    },
    workShifts: {
      totalHours: Math.round(totalShiftHours * 100) / 100,
      daysPresent: shiftDays.size,
      shiftCount: shifts.length,
    },
    focus: {
      total: focusItems.length,
      done: focusDone,
      completionRate: focusItems.length
        ? Math.round((focusDone / focusItems.length) * 100)
        : 0,
      weeklyTrend: [...focusByWeek.values()].sort((a, b) => a.week.localeCompare(b.week)),
    },
    ratings: {
      average: ratingsAvg,
      count: ratings.length,
      latest: ratings[0] ?? null,
    },
    dailyReports: {
      count: reports.length,
      withBlockers: reportsWithBlockers,
    },
  };
}

async function buildPerformancePayload(viewerId, targetUserId, monthInput, { includeTeamContext = false } = {}) {
  const period = parseMonth(monthInput);
  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, name: true, email: true, avatar: true },
  });
  if (!user) throw new HttpError(404, "User not found");

  const [kpis, insights] = await Promise.all([
    aggregateMonthlyKpis(targetUserId, period),
    getProgressInsights(viewerId, targetUserId).catch((err) => {
      console.error(`[performance] getProgressInsights failed for ${targetUserId}:`, err.message);
      return null;
    }),
  ]);

  const payload = {
    userId: targetUserId,
    user,
    month: period.month,
    period: {
      from: period.from.toISOString(),
      to: period.to.toISOString(),
    },
    kpis,
    insights,
  };

  if (includeTeamContext && viewerId !== targetUserId) {
    payload.teamContext = await sharedTeamContext(viewerId, targetUserId);
  }

  return payload;
}

export async function getMyPerformance(userId, { month } = {}) {
  return buildPerformancePayload(userId, userId, month);
}

export async function getUserPerformance(viewerId, targetUserId, { month } = {}) {
  const access = await assertCanViewPerformance(viewerId, targetUserId);
  const payload = await buildPerformancePayload(
    viewerId,
    targetUserId,
    month,
    { includeTeamContext: !access.isSelf },
  );
  return payload;
}

export async function getTeamPerformance(viewerId, { teamId, month } = {}) {
  const viewer = await loadUserContext(viewerId);
  const memberIds = await getManagedMemberUserIds(viewerId, viewer, { teamId });
  if (!memberIds.length) {
    throw new HttpError(403, "No team access for performance summary");
  }

  const period = parseMonth(month);
  const users = await prisma.user.findMany({
    where: { id: { in: memberIds }, isActive: true },
    select: { id: true, name: true, email: true, avatar: true },
    orderBy: { name: "asc" },
  });

  const members = await Promise.all(
    users.map(async (user) => {
      const kpis = await aggregateMonthlyKpis(user.id, period);
      return {
        user,
        userId: user.id,
        month: period.month,
        kpis,
      };
    }),
  );

  return {
    month: period.month,
    period: {
      from: period.from.toISOString(),
      to: period.to.toISOString(),
    },
    teamId: teamId ?? null,
    members,
  };
}
