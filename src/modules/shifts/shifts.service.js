import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { getUserOrganizationId, DEFAULT_ORG_ID } from "../../lib/orgScope.js";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getTodayShift(userId) {
  const today = startOfToday();
  return prisma.workShift.findFirst({
    where: {
      userId,
      startedAt: { gte: today },
    },
    orderBy: { startedAt: "desc" },
  });
}

export async function startShift(userId) {
  const open = await prisma.workShift.findFirst({
    where: { userId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (open) {
    throw new HttpError(409, "You already have an open shift");
  }

  const organizationId = await getUserOrganizationId(userId);
  return prisma.workShift.create({
    data: {
      userId,
      organizationId: organizationId ?? DEFAULT_ORG_ID,
    },
  });
}

export async function endShift(userId, { note } = {}) {
  const open = await prisma.workShift.findFirst({
    where: { userId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (!open) {
    throw new HttpError(404, "No open shift to end");
  }
  return prisma.workShift.update({
    where: { id: open.id },
    data: {
      endedAt: new Date(),
      ...(note !== undefined && { note: note?.trim() || null }),
    },
  });
}

export async function listMyShifts(userId, { limit = 14 } = {}) {
  return prisma.workShift.findMany({
    where: { userId },
    orderBy: { startedAt: "desc" },
    take: limit,
  });
}
