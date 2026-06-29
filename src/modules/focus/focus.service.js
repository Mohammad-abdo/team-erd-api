import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";

function toDateOnly(value) {
  const d = value ? new Date(value) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function listTodayFocus(userId, { date } = {}) {
  const focusDate = toDateOnly(date);
  return prisma.todayFocusItem.findMany({
    where: { userId, focusDate },
    orderBy: { sortOrder: "asc" },
  });
}

export async function createFocusItem(userId, input) {
  const focusDate = toDateOnly(input.focusDate);
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
  });
}

export async function updateFocusItem(userId, itemId, input) {
  const row = await prisma.todayFocusItem.findFirst({
    where: { id: itemId, userId },
  });
  if (!row) throw new HttpError(404, "Focus item not found");

  return prisma.todayFocusItem.update({
    where: { id: itemId },
    data: {
      ...(input.title !== undefined && { title: input.title.trim() }),
      ...(input.isDone !== undefined && { isDone: input.isDone }),
    },
  });
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
