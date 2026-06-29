import { TaskStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { isOrgAdmin, isPlatformAdmin } from "../../middleware/adminAccess.js";
import { isTeamLeadOverUser, getManagedTeamIds, getManagedMemberUserIds } from "../../lib/teamHierarchy.js";
import { loadUserContext } from "../../lib/orgScope.js";
import { getMemberProfile } from "../members/members.service.js";
import { getTaskStats } from "../tasks/tasks.service.js";
import { shiftHours } from "../shifts/shifts.service.js";

function toDateOnly(value) {
  const d = value ? new Date(value) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfDay(value) {
  const d = value ? new Date(value) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(value) {
  const d = startOfDay(value);
  d.setDate(d.getDate() + 1);
  return d;
}

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

function heatFromLoad(load) {
  if (load >= 12) return "high";
  if (load >= 6) return "medium";
  return "low";
}

function loadPercent(load) {
  return Math.min(100, Math.round((load / 14) * 100));
}

export async function getProgressInsights(viewerId, targetUserId) {
  if (viewerId !== targetUserId) {
    const viewer = await prisma.user.findUnique({
      where: { id: viewerId },
      select: { platformRole: true, organizationId: true },
    });
    const admin = await isPlatformAdmin(viewerId);
    const orgAdmin = await isOrgAdmin(viewerId);
    if (!admin && !orgAdmin && !(await isTeamLeadOverUser(viewerId, targetUserId, viewer))) {
      throw new HttpError(403, "You do not have access to this progress data");
    }
  }

  const [profile, stats] = await Promise.all([
    getMemberProfile(viewerId, targetUserId).catch(() => null),
    getTaskStats(targetUserId, { assigneeId: targetUserId }).catch(() => null),
  ]);

  return {
    userId: targetUserId,
    summary: profile?.workReport?.summary ?? null,
    taskStats: stats,
    ratings: profile?.ratings?.slice(0, 3) ?? [],
    dailyTasksWeek: profile?.workReport?.dailyTaskBreakdown ?? null,
  };
}

export async function getTeamProgressInsights(viewerId) {
  const user = await prisma.user.findUnique({
    where: { id: viewerId },
    select: { platformRole: true, organizationId: true },
  });
  const managedTeamIds = await getManagedTeamIds(viewerId, user);
  if (!managedTeamIds.length) {
    throw new HttpError(403, "Team lead or admin access required");
  }

  const members = await prisma.teamMember.findMany({
    where: { teamId: { in: managedTeamIds } },
    select: { userId: true, user: { select: { id: true, name: true, avatar: true } } },
    distinct: ["userId"],
  });

  const rows = await Promise.all(
    members
      .filter((m) => m.userId !== viewerId)
      .map(async (m) => {
        const insights = await getProgressInsights(viewerId, m.userId).catch(() => null);
        return insights ? { user: m.user, ...insights } : null;
      }),
  );

  return rows.filter(Boolean);
}

export async function getTeamCapacity(viewerId, { teamId, date, month } = {}) {
  const viewer = await loadUserContext(viewerId);
  const memberIds = await getManagedMemberUserIds(viewerId, viewer, { teamId });
  if (!memberIds.length) throw new HttpError(403, "Team manager access required");

  const focusDate = toDateOnly(date);
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  const period = parseMonth(month);
  const now = new Date();

  const users = await prisma.user.findMany({
    where: { id: { in: memberIds }, isActive: true },
    select: { id: true, name: true, email: true, avatar: true },
    orderBy: { name: "asc" },
  });

  const [
    activeTasks,
    focusToday,
    dayShifts,
    focusMonth,
    monthShifts,
    completedMonth,
  ] = await Promise.all([
    prisma.projectTask.findMany({
      where: {
        status: { not: TaskStatus.DONE },
        assignees: { some: { userId: { in: memberIds } } },
      },
      select: {
        dueDate: true,
        assignees: { where: { userId: { in: memberIds } }, select: { userId: true } },
      },
    }),
    prisma.todayFocusItem.findMany({
      where: { userId: { in: memberIds }, focusDate },
      orderBy: { sortOrder: "asc" },
      select: { userId: true, title: true, isDone: true, dismissedAt: true },
    }),
    prisma.workShift.findMany({
      where: {
        userId: { in: memberIds },
        startedAt: { gte: dayStart, lt: dayEnd },
      },
      orderBy: { startedAt: "desc" },
      select: {
        userId: true,
        startedAt: true,
        endedAt: true,
        pausedAt: true,
        pausedSeconds: true,
      },
    }),
    prisma.todayFocusItem.findMany({
      where: {
        userId: { in: memberIds },
        focusDate: { gte: period.from, lt: period.to },
      },
      select: { userId: true, isDone: true },
    }),
    prisma.workShift.findMany({
      where: {
        userId: { in: memberIds },
        startedAt: { gte: period.from, lt: period.to },
      },
      select: {
        userId: true,
        startedAt: true,
        endedAt: true,
        pausedAt: true,
        pausedSeconds: true,
      },
    }),
    prisma.projectTask.findMany({
      where: {
        status: TaskStatus.DONE,
        completedAt: { gte: period.from, lt: period.to },
        assignees: { some: { userId: { in: memberIds } } },
      },
      select: {
        assignees: { where: { userId: { in: memberIds } }, select: { userId: true } },
      },
    }),
  ]);

  const activeMap = new Map(memberIds.map((id) => [id, 0]));
  const overdueMap = new Map(memberIds.map((id) => [id, 0]));
  for (const task of activeTasks) {
    const isOverdue = task.dueDate && new Date(task.dueDate) < now;
    for (const a of task.assignees) {
      activeMap.set(a.userId, (activeMap.get(a.userId) ?? 0) + 1);
      if (isOverdue) overdueMap.set(a.userId, (overdueMap.get(a.userId) ?? 0) + 1);
    }
  }

  const focusTodayMap = new Map(memberIds.map((id) => [id, []]));
  for (const item of focusToday) {
    focusTodayMap.get(item.userId)?.push({
      title: item.title,
      isDone: item.isDone,
      dismissedAt: item.dismissedAt,
    });
  }

  const shiftMap = new Map(memberIds.map((id) => [id, {
    onShiftNow: false,
    pausedNow: false,
    todayHours: 0,
  }]));
  for (const shift of dayShifts) {
    const row = shiftMap.get(shift.userId);
    if (!row) continue;
    row.todayHours += shiftHours(shift);
    if (!shift.endedAt) {
      row.onShiftNow = true;
      row.pausedNow = Boolean(shift.pausedAt);
    }
  }
  for (const [id, row] of shiftMap) {
    row.todayHours = Math.round(row.todayHours * 100) / 100;
    shiftMap.set(id, row);
  }

  const focusMonthMap = new Map(memberIds.map((id) => [id, { total: 0, done: 0 }]));
  for (const item of focusMonth) {
    const row = focusMonthMap.get(item.userId);
    if (!row) continue;
    row.total += 1;
    if (item.isDone) row.done += 1;
  }

  const shiftHoursMap = new Map(memberIds.map((id) => [id, 0]));
  for (const shift of monthShifts) {
    shiftHoursMap.set(
      shift.userId,
      (shiftHoursMap.get(shift.userId) ?? 0) + shiftHours(shift),
    );
  }

  const tasksDoneMap = new Map(memberIds.map((id) => [id, 0]));
  for (const task of completedMonth) {
    for (const a of task.assignees) {
      tasksDoneMap.set(a.userId, (tasksDoneMap.get(a.userId) ?? 0) + 1);
    }
  }

  const members = users.map((user) => {
    const active = activeMap.get(user.id) ?? 0;
    const overdue = overdueMap.get(user.id) ?? 0;
    const load = active + overdue * 2;
    const focusItems = focusTodayMap.get(user.id) ?? [];
    const focusDone = focusItems.filter((i) => i.isDone).length;
    const monthFocus = focusMonthMap.get(user.id) ?? { total: 0, done: 0 };
    const shift = shiftMap.get(user.id) ?? { onShiftNow: false, pausedNow: false, todayHours: 0 };
    const monthShiftHours = Math.round((shiftHoursMap.get(user.id) ?? 0) * 100) / 100;
    const tasksDone = tasksDoneMap.get(user.id) ?? 0;

    return {
      user,
      activeTasks: active,
      overdueTasks: overdue,
      load,
      loadPercent: loadPercent(load),
      heat: heatFromLoad(load),
      focus: {
        done: focusDone,
        total: focusItems.length,
        items: focusItems
          .filter((i) => !i.dismissedAt)
          .slice(0, 6)
          .map(({ title, isDone }) => ({ title, isDone })),
      },
      shift,
      month: {
        tasksDone,
        focusRate: monthFocus.total
          ? Math.round((monthFocus.done / monthFocus.total) * 100)
          : 0,
        shiftHours: monthShiftHours,
      },
    };
  });

  return {
    date: focusDate.toISOString().slice(0, 10),
    month: period.month,
    members: members.sort((a, b) => b.load - a.load),
  };
}
