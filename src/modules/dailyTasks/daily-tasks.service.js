import { DailyTaskSource, TaskStatus, TeamRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { isPlatformAdmin } from "../../middleware/adminAccess.js";

const taskInclude = {
  team: { select: { id: true, name: true, color: true, slug: true } },
  assignee: { select: { id: true, name: true, avatar: true, email: true } },
  createdBy: { select: { id: true, name: true, avatar: true } },
};

function formatDailyTask(row) {
  return {
    id: row.id,
    teamId: row.teamId,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    taskDate: row.taskDate,
    assigneeId: row.assigneeId,
    createdById: row.createdById,
    source: row.source,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    team: row.team,
    assignee: row.assignee,
    createdBy: row.createdBy,
  };
}

function toDateOnly(input) {
  if (!input) return startOfToday();
  const d = new Date(`${input}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, "Invalid date");
  return d;
}

function startOfToday() {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  return d;
}

function dateToKey(d) {
  return d.toISOString().slice(0, 10);
}

async function getTeamAccess(userId, teamId) {
  const admin = await isPlatformAdmin(userId);
  if (admin) return { isAdmin: true, isLead: true, member: null };
  const member = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
  });
  if (!member) throw new HttpError(403, "Not a team member");
  return {
    isAdmin: false,
    isLead: member.role === TeamRole.TEAM_LEAD,
    member,
  };
}

async function assertAssigneeInTeam(teamId, assigneeId) {
  const member = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: assigneeId } },
  });
  if (!member) throw new HttpError(400, "Assignee must be a team member");
}

async function notifyAssignee({ task, team, assigneeId, actorId }) {
  if (!assigneeId || assigneeId === actorId) return;
  const { deliverNotification } = await import("../../lib/notify.js");
  await deliverNotification({
    userId: assigneeId,
    type: "DAILY_TASK_ASSIGNED",
    title: `Daily task: ${task.title}`,
    body: `${team.name} — ${task.title}`,
    data: { taskId: task.id, teamId: team.id, taskDate: dateToKey(task.taskDate) },
  });
}

function canManageTask(access, userId, task) {
  if (access.isAdmin || access.isLead) return true;
  return task.assigneeId === userId || task.createdById === userId;
}

export async function listTeamDailyTasks(userId, teamId, { date, assigneeId, status, mine } = {}) {
  const access = await getTeamAccess(userId, teamId);
  const taskDate = toDateOnly(date);

  const where = {
    teamId,
    taskDate,
    ...(status ? { status } : {}),
  };

  if (mine) {
    where.assigneeId = userId;
  } else if (assigneeId) {
    if (!access.isLead && !access.isAdmin && assigneeId !== userId) {
      throw new HttpError(403, "Only team leads can view other members' tasks");
    }
    where.assigneeId = assigneeId;
  } else if (!access.isLead && !access.isAdmin) {
    where.assigneeId = userId;
  }

  const rows = await prisma.dailyTask.findMany({
    where,
    orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
    include: taskInclude,
  });

  return rows.map(formatDailyTask);
}

export async function getTeamDailyTaskStats(userId, teamId, { date } = {}) {
  const access = await getTeamAccess(userId, teamId);
  const taskDate = toDateOnly(date);

  const baseWhere = {
    teamId,
    taskDate,
    ...(!access.isLead && !access.isAdmin ? { assigneeId: userId } : {}),
  };

  const [total, todo, inProgress, done, assigned, personal] = await Promise.all([
    prisma.dailyTask.count({ where: baseWhere }),
    prisma.dailyTask.count({ where: { ...baseWhere, status: TaskStatus.TODO } }),
    prisma.dailyTask.count({ where: { ...baseWhere, status: TaskStatus.IN_PROGRESS } }),
    prisma.dailyTask.count({ where: { ...baseWhere, status: TaskStatus.DONE } }),
    prisma.dailyTask.count({ where: { ...baseWhere, source: DailyTaskSource.ASSIGNED } }),
    prisma.dailyTask.count({ where: { ...baseWhere, source: DailyTaskSource.PERSONAL } }),
  ]);

  return { total, todo, inProgress, done, assigned, personal, taskDate: dateToKey(taskDate) };
}

export async function getDailyTask(userId, teamId, taskId) {
  await getTeamAccess(userId, teamId);
  const row = await prisma.dailyTask.findFirst({
    where: { id: taskId, teamId },
    include: taskInclude,
  });
  if (!row) throw new HttpError(404, "Daily task not found");
  return formatDailyTask(row);
}

export async function createDailyTask(userId, teamId, input) {
  const access = await getTeamAccess(userId, teamId);
  const taskDate = toDateOnly(input.taskDate);
  const assigneeId = input.assigneeId ?? userId;

  await assertAssigneeInTeam(teamId, assigneeId);

  const isAssignedToOther = assigneeId !== userId;
  let source = DailyTaskSource.PERSONAL;

  if (isAssignedToOther) {
    if (!access.isLead && !access.isAdmin) {
      throw new HttpError(403, "Only team leads can assign tasks to others");
    }
    source = DailyTaskSource.ASSIGNED;
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, name: true },
  });
  if (!team) throw new HttpError(404, "Team not found");

  const status = input.status ?? TaskStatus.TODO;

  const task = await prisma.dailyTask.create({
    data: {
      teamId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      status,
      priority: input.priority ?? "MEDIUM",
      taskDate,
      assigneeId,
      createdById: userId,
      source,
      completedAt: status === TaskStatus.DONE ? new Date() : null,
    },
    include: taskInclude,
  });

  if (source === DailyTaskSource.ASSIGNED) {
    await notifyAssignee({ task, team, assigneeId, actorId: userId });
  }

  return formatDailyTask(task);
}

export async function updateDailyTask(userId, teamId, taskId, input) {
  const access = await getTeamAccess(userId, teamId);
  const existing = await prisma.dailyTask.findFirst({
    where: { id: taskId, teamId },
  });
  if (!existing) throw new HttpError(404, "Daily task not found");
  if (!canManageTask(access, userId, existing)) {
    throw new HttpError(403, "Cannot update this task");
  }

  const data = {};
  if (input.title !== undefined) data.title = input.title.trim();
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.priority !== undefined) data.priority = input.priority;
  if (input.taskDate !== undefined) data.taskDate = toDateOnly(input.taskDate);

  if (input.assigneeId !== undefined) {
    if (!access.isLead && !access.isAdmin) {
      throw new HttpError(403, "Only team leads can reassign tasks");
    }
    await assertAssigneeInTeam(teamId, input.assigneeId);
    data.assigneeId = input.assigneeId;
    if (input.assigneeId !== existing.assigneeId && input.assigneeId !== userId) {
      data.source = DailyTaskSource.ASSIGNED;
    }
  }

  if (input.status !== undefined) {
    data.status = input.status;
    if (input.status === TaskStatus.DONE) {
      data.completedAt = new Date();
    } else if (existing.status === TaskStatus.DONE) {
      data.completedAt = null;
    }
  }

  const task = await prisma.dailyTask.update({
    where: { id: taskId },
    data,
    include: taskInclude,
  });

  if (input.assigneeId && input.assigneeId !== existing.assigneeId) {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, name: true },
    });
    await notifyAssignee({ task, team, assigneeId: input.assigneeId, actorId: userId });
  }

  return formatDailyTask(task);
}

export async function deleteDailyTask(userId, teamId, taskId) {
  const access = await getTeamAccess(userId, teamId);
  const existing = await prisma.dailyTask.findFirst({
    where: { id: taskId, teamId },
  });
  if (!existing) throw new HttpError(404, "Daily task not found");
  if (!canManageTask(access, userId, existing)) {
    throw new HttpError(403, "Cannot delete this task");
  }
  await prisma.dailyTask.delete({ where: { id: taskId } });
}

export async function listMyDailyTasksToday(userId, { date } = {}) {
  const taskDate = toDateOnly(date);
  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    select: { teamId: true },
  });
  const teamIds = memberships.map((m) => m.teamId);
  if (!teamIds.length) return [];

  const rows = await prisma.dailyTask.findMany({
    where: {
      teamId: { in: teamIds },
      assigneeId: userId,
      taskDate,
    },
    orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
    include: taskInclude,
  });

  return rows.map(formatDailyTask);
}

export async function getMyDailyTaskStats(userId, { date } = {}) {
  const taskDate = toDateOnly(date);
  const where = { assigneeId: userId, taskDate };

  const [total, todo, inProgress, done] = await Promise.all([
    prisma.dailyTask.count({ where }),
    prisma.dailyTask.count({ where: { ...where, status: TaskStatus.TODO } }),
    prisma.dailyTask.count({ where: { ...where, status: TaskStatus.IN_PROGRESS } }),
    prisma.dailyTask.count({ where: { ...where, status: TaskStatus.DONE } }),
  ]);

  return { total, todo, inProgress, done, taskDate: dateToKey(taskDate) };
}

export async function getTeamMembersForTasks(userId, teamId) {
  await getTeamAccess(userId, teamId);
  const members = await prisma.teamMember.findMany({
    where: { teamId },
    include: { user: { select: { id: true, name: true, avatar: true, email: true } } },
    orderBy: { joinedAt: "asc" },
  });
  return members.map((m) => ({
    userId: m.userId,
    role: m.role,
    user: m.user,
  }));
}
