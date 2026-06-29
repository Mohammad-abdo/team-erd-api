import { TaskStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { getManagedMemberUserIds } from "../../lib/teamHierarchy.js";

function toDateOnly(value) {
  const d = value ? new Date(value) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function loadViewer(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, platformRole: true, organizationId: true },
  });
  if (!user) throw new HttpError(401, "Unauthorized");
  return user;
}

async function assertTaskLink(userId, taskId) {
  if (!taskId) return;
  const task = await prisma.projectTask.findUnique({
    where: { id: taskId },
    include: {
      assignees: { select: { userId: true } },
      project: { select: { leaderId: true } },
    },
  });
  if (!task) throw new HttpError(404, "Task not found");
  const assigned = task.assignees.some((a) => a.userId === userId);
  if (!assigned && task.project.leaderId !== userId) {
    throw new HttpError(403, "Task is not assigned to you");
  }
}

export async function listTodayFocus(userId, { date } = {}) {
  const focusDate = toDateOnly(date);
  return prisma.todayFocusItem.findMany({
    where: { userId, focusDate },
    orderBy: { sortOrder: "asc" },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          status: true,
          projectId: true,
          project: { select: { id: true, name: true } },
        },
      },
    },
  });
}

export async function createFocusItem(userId, input) {
  const focusDate = toDateOnly(input.focusDate);
  if (input.taskId) {
    await assertTaskLink(userId, input.taskId);
  }
  const max = await prisma.todayFocusItem.aggregate({
    where: { userId, focusDate },
    _max: { sortOrder: true },
  });
  return prisma.todayFocusItem.create({
    data: {
      userId,
      focusDate,
      title: input.title.trim(),
      sortOrder: (max._max.sortOrder ?? -1) + 1,
      taskId: input.taskId ?? null,
    },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          project: { select: { id: true, name: true } },
        },
      },
    },
  });
}

export async function updateFocusItem(userId, itemId, input) {
  const row = await prisma.todayFocusItem.findFirst({
    where: { id: itemId, userId },
  });
  if (!row) throw new HttpError(404, "Focus item not found");

  const item = await prisma.todayFocusItem.update({
    where: { id: itemId },
    data: {
      ...(input.title !== undefined && { title: input.title.trim() }),
      ...(input.isDone !== undefined && { isDone: input.isDone }),
    },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          project: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (input.isDone === true && input.syncTask && row.taskId) {
    try {
      await assertTaskLink(userId, row.taskId); // re-check permission — user may have been unassigned
      await prisma.projectTask.update({
        where: { id: row.taskId },
        data: { status: TaskStatus.DONE, completedAt: new Date(), progress: 100 },
      });
    } catch (err) {
      if (err?.statusCode === 403) throw err; // propagate authorization errors
      // task was deleted — skip sync gracefully
    }
  }

  return item;
}

export async function reorderFocusItems(userId, { date, orderedIds }) {
  const focusDate = toDateOnly(date);
  const rows = await prisma.todayFocusItem.findMany({
    where: { userId, focusDate },
    select: { id: true },
  });
  const allowed = new Set(rows.map((r) => r.id));
  if (orderedIds.length !== rows.length || orderedIds.some((id) => !allowed.has(id))) {
    throw new HttpError(400, "Invalid focus order");
  }

  await prisma.$transaction(
    orderedIds.map((id, index) => prisma.todayFocusItem.update({
      where: { id },
      data: { sortOrder: index },
    })),
  );

  return listTodayFocus(userId, { date: focusDate });
}

export async function deleteFocusItem(userId, itemId) {
  const row = await prisma.todayFocusItem.findFirst({
    where: { id: itemId, userId },
  });
  if (!row) throw new HttpError(404, "Focus item not found");
  await prisma.todayFocusItem.delete({ where: { id: itemId } });
}

export async function getTeamFocusSummary(viewerId, { teamId, date } = {}) {
  const viewer = await loadViewer(viewerId);
  const memberIds = await getManagedMemberUserIds(viewerId, viewer, { teamId });
  if (!memberIds.length) throw new HttpError(403, "No team access for focus summary");

  const focusDate = toDateOnly(date);
  const users = await prisma.user.findMany({
    where: { id: { in: memberIds }, isActive: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  const items = await prisma.todayFocusItem.findMany({
    where: { userId: { in: memberIds }, focusDate },
    orderBy: { sortOrder: "asc" },
    select: { userId: true, title: true, isDone: true },
  });

  const byUser = new Map(users.map((u) => [u.id, { user: u, items: [] }]));
  for (const item of items) {
    byUser.get(item.userId)?.items.push({ title: item.title, isDone: item.isDone });
  }

  return {
    date: focusDate.toISOString().slice(0, 10),
    members: [...byUser.values()],
  };
}
