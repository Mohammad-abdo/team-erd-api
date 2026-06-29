import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { getUserOrganizationId, DEFAULT_ORG_ID } from "../../lib/orgScope.js";
import { getManagedMemberUserIds } from "../../lib/teamHierarchy.js";

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

function startOfWeek(value) {
  const d = startOfDay(value);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function shiftHours(shift) {
  const end = shift.endedAt ? new Date(shift.endedAt) : new Date();
  const start = new Date(shift.startedAt);
  return Math.max(0, (end.getTime() - start.getTime()) / 3600000);
}

async function loadViewer(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, platformRole: true, organizationId: true },
  });
  if (!user) throw new HttpError(401, "Unauthorized");
  return user;
}

export async function getTodayShift(userId) {
  const today = startOfDay();
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

export async function getTeamShiftBoard(viewerId, { teamId, date } = {}) {
  const viewer = await loadViewer(viewerId);
  const memberIds = await getManagedMemberUserIds(viewerId, viewer, { teamId });
  if (!memberIds.length) {
    throw new HttpError(403, "No team access for shift board");
  }

  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  const weekStart = startOfWeek(date);

  const users = await prisma.user.findMany({
    where: { id: { in: memberIds }, isActive: true },
    select: { id: true, name: true, email: true, avatar: true },
    orderBy: { name: "asc" },
  });

  const shifts = await prisma.workShift.findMany({
    where: {
      userId: { in: memberIds },
      startedAt: { gte: weekStart, lt: dayEnd },
    },
    orderBy: { startedAt: "desc" },
  });

  const byUser = new Map();
  for (const u of users) {
    byUser.set(u.id, {
      user: u,
      onShiftNow: false,
      todayHours: 0,
      weekHours: 0,
      todayShifts: [],
    });
  }

  for (const shift of shifts) {
    const row = byUser.get(shift.userId);
    if (!row) continue;
    const hours = shiftHours(shift);
    const started = new Date(shift.startedAt);
    if (started >= weekStart) row.weekHours += hours;
    if (started >= dayStart && started < dayEnd) {
      row.todayHours += hours;
      row.todayShifts.push(shift);
      if (!shift.endedAt) row.onShiftNow = true;
    }
  }

  return {
    date: dayStart.toISOString().slice(0, 10),
    members: [...byUser.values()].map((r) => ({
      ...r,
      todayHours: Math.round(r.todayHours * 100) / 100,
      weekHours: Math.round(r.weekHours * 100) / 100,
    })),
  };
}

export async function exportTeamShiftsCsv(viewerId, { teamId, from, to } = {}) {
  const viewer = await loadViewer(viewerId);
  const memberIds = await getManagedMemberUserIds(viewerId, viewer, { teamId });
  if (!memberIds.length) throw new HttpError(403, "No team access");

  const fromDate = startOfDay(from ?? new Date());
  const toDate = endOfDay(to ?? from ?? new Date());

  const shifts = await prisma.workShift.findMany({
    where: {
      userId: { in: memberIds },
      startedAt: { gte: fromDate, lt: toDate },
    },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { startedAt: "asc" },
  });

  const header = "user_name,user_email,started_at,ended_at,hours,note";
  const lines = shifts.map((s) => {
    const hours = shiftHours(s).toFixed(2);
    const name = `"${(s.user.name ?? "").replace(/"/g, '""')}"`;
    const email = s.user.email ?? "";
    const started = new Date(s.startedAt).toISOString();
    const ended = s.endedAt ? new Date(s.endedAt).toISOString() : "";
    const note = `"${(s.note ?? "").replace(/"/g, '""')}"`;
    return `${name},${email},${started},${ended},${hours},${note}`;
  });

  return [header, ...lines].join("\n");
}
