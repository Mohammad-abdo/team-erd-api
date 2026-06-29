import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import {
  getUserOrganizationId,
  DEFAULT_ORG_ID,
  loadUserContext,
  userIsOrgAdmin,
  isSuperAdmin,
} from "../../lib/orgScope.js";

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

export function shiftHours(shift) {
  const start = new Date(shift.startedAt).getTime();
  const end = shift.endedAt
    ? new Date(shift.endedAt).getTime()
    : shift.pausedAt
      ? new Date(shift.pausedAt).getTime()
      : Date.now();
  const pausedMs = (shift.pausedSeconds ?? 0) * 1000;
  return Math.max(0, (end - start - pausedMs) / 3600000);
}

async function getOpenShift(userId) {
  return prisma.workShift.findFirst({
    where: { userId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
}

/** Team members visible on the shift board (any member, not managers only). */
async function resolveBoardMemberIds(viewerId, viewer, { teamId } = {}) {
  const orgId = viewer.organizationId ?? DEFAULT_ORG_ID;

  if (userIsOrgAdmin(viewer) || isSuperAdmin(viewer)) {
    const teamWhere = teamId ? { id: teamId } : { organizationId: orgId };
    const members = await prisma.teamMember.findMany({
      where: { team: teamWhere },
      select: { userId: true },
      distinct: ["userId"],
    });
    return members.map((m) => m.userId);
  }

  const myMemberships = await prisma.teamMember.findMany({
    where: { userId: viewerId },
    select: { teamId: true },
  });
  const myTeamIds = myMemberships.map((m) => m.teamId);
  if (!myTeamIds.length) return [viewerId];

  let scopeTeamIds = myTeamIds;
  if (teamId) {
    if (!myTeamIds.includes(teamId)) {
      throw new HttpError(403, "Not a member of this team");
    }
    scopeTeamIds = [teamId];
  }

  const members = await prisma.teamMember.findMany({
    where: { teamId: { in: scopeTeamIds } },
    select: { userId: true },
    distinct: ["userId"],
  });
  return members.length ? members.map((m) => m.userId) : [viewerId];
}

export async function getTodayShift(userId) {
  const open = await getOpenShift(userId);
  if (open) return open;

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
  const open = await getOpenShift(userId);
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

export async function pauseShift(userId) {
  const open = await getOpenShift(userId);
  if (!open) {
    throw new HttpError(404, "No open shift to pause");
  }
  if (open.pausedAt) {
    throw new HttpError(409, "Shift is already paused");
  }
  return prisma.workShift.update({
    where: { id: open.id },
    data: { pausedAt: new Date() },
  });
}

export async function resumeShift(userId) {
  const open = await getOpenShift(userId);
  if (!open) {
    throw new HttpError(404, "No open shift to resume");
  }
  if (!open.pausedAt) {
    throw new HttpError(409, "Shift is not paused");
  }
  const extra = Math.floor((Date.now() - new Date(open.pausedAt).getTime()) / 1000);
  return prisma.workShift.update({
    where: { id: open.id },
    data: {
      pausedAt: null,
      pausedSeconds: (open.pausedSeconds ?? 0) + extra,
    },
  });
}

export async function endShift(userId, { note } = {}) {
  const open = await getOpenShift(userId);
  if (!open) {
    throw new HttpError(404, "No open shift to end");
  }

  let pausedSeconds = open.pausedSeconds ?? 0;
  if (open.pausedAt) {
    pausedSeconds += Math.floor((Date.now() - new Date(open.pausedAt).getTime()) / 1000);
  }

  return prisma.workShift.update({
    where: { id: open.id },
    data: {
      endedAt: new Date(),
      pausedAt: null,
      pausedSeconds,
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
  const viewer = await loadUserContext(viewerId);
  const memberIds = await resolveBoardMemberIds(viewerId, viewer, { teamId });
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
      pausedNow: false,
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
      if (!shift.endedAt) {
        row.onShiftNow = true;
        row.pausedNow = Boolean(shift.pausedAt);
      }
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
  const viewer = await loadUserContext(viewerId);
  const memberIds = await resolveBoardMemberIds(viewerId, viewer, { teamId });
  if (!memberIds.length) throw new HttpError(403, "No team access");

  const fromDate = startOfDay(from ?? new Date());
  const toDate = endOfDay(to ?? from ?? new Date());
  if (toDate <= fromDate) {
    throw new HttpError(400, "to date must be on or after from date");
  }

  const shifts = await prisma.workShift.findMany({
    where: {
      userId: { in: memberIds },
      startedAt: { gte: fromDate, lt: toDate },
    },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { startedAt: "asc" },
  });

  const header = "user_name,user_email,started_at,ended_at,hours,paused_seconds,note";
  const lines = shifts.map((s) => {
    const hours = shiftHours(s).toFixed(2);
    const name = `"${(s.user.name ?? "").replace(/"/g, '""')}"`;
    const email = s.user.email ?? "";
    const started = new Date(s.startedAt).toISOString();
    const ended = s.endedAt ? new Date(s.endedAt).toISOString() : "";
    const note = `"${(s.note ?? "").replace(/"/g, '""')}"`;
    return `${name},${email},${started},${ended},${hours},${s.pausedSeconds ?? 0},${note}`;
  });

  return [header, ...lines].join("\n");
}
