import { PlatformRole, ProjectMemberRole, TaskStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { logActivity } from "../activity/activity.service.js";
import { assertCanAssignTask, assertCanEditTask } from "../../lib/taskAccess.js";

const taskInclude = {
  project: {
    select: {
      id: true,
      name: true,
      slug: true,
      leaderId: true,
      healthStage: true,
      teamProjects: {
        include: {
          team: { select: { id: true, name: true, slug: true, color: true } },
        },
      },
    },
  },
  createdBy: { select: { id: true, name: true, avatar: true } },
  assignees: {
    include: {
      user: { select: { id: true, name: true, avatar: true, email: true } },
    },
  },
};

function formatProject(project) {
  if (!project) return null;
  const { teamProjects, ...rest } = project;
  return {
    ...rest,
    teams: (teamProjects ?? []).map((tp) => tp.team),
  };
}

function formatTask(row) {
  const project = formatProject(row.project);
  const isDelayed =
    row.dueDate &&
    row.status !== TaskStatus.DONE &&
    new Date(row.dueDate) < new Date();

  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    progress: row.progress,
    dueDate: row.dueDate,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
    checklist: Array.isArray(row.checklist) ? row.checklist : [],
    dependsOnIds: Array.isArray(row.dependsOnIds) ? row.dependsOnIds : [],
    isDelayed,
    project,
    teams: project?.teams ?? [],
    createdBy: row.createdBy,
    assignees: row.assignees.map((a) => a.user),
  };
}

function buildTaskWhere(projectIds, filters = {}) {
  const {
    assigneeId,
    status,
    teamId,
    search,
    priority,
    dueFrom,
    dueTo,
    category,
    viewerId,
  } = filters;

  const where = {
    projectId: { in: projectIds },
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(assigneeId ? { assignees: { some: { userId: assigneeId } } } : {}),
    ...(teamId ? { project: { teamProjects: { some: { teamId } } } } : {}),
    ...(category === "mine" && viewerId
      ? { assignees: { some: { userId: viewerId } } }
      : {}),
  };

  if (search?.trim()) {
    const q = search.trim();
    where.OR = [
      { title: { contains: q } },
      { description: { contains: q } },
      { project: { name: { contains: q } } },
    ];
  }

  if (dueFrom || dueTo) {
    where.dueDate = {};
    if (dueFrom) where.dueDate.gte = new Date(`${dueFrom}T00:00:00.000Z`);
    if (dueTo) where.dueDate.lte = new Date(`${dueTo}T23:59:59.999Z`);
  }

  return where;
}

function projectAccessWhere(userId) {
  return {
    OR: [
      { leaderId: userId },
      { members: { some: { userId } } },
      { teamProjects: { some: { team: { members: { some: { userId } } } } } },
    ],
  };
}

async function resolveProjectAccessWhere(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { platformRole: true },
  });
  if (user?.platformRole === PlatformRole.CLIENT) {
    return { members: { some: { userId } } };
  }
  return projectAccessWhere(userId);
}

async function accessibleProjectIds(userId, projectId) {
  const where = await resolveProjectAccessWhere(userId);
  if (projectId) {
    const p = await prisma.project.findFirst({
      where: { id: projectId, ...where },
      select: { id: true },
    });
    if (!p) throw new HttpError(403, "No access to this project");
    return [projectId];
  }
  const rows = await prisma.project.findMany({
    where,
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function assertAssigneesAreMembers(projectId, assigneeIds) {
  if (!assigneeIds?.length) return;
  const members = await prisma.projectMember.findMany({
    where: { projectId, userId: { in: assigneeIds } },
    select: { userId: true },
  });
  const leader = await prisma.project.findUnique({
    where: { id: projectId },
    select: { leaderId: true },
  });
  const allowed = new Set([...members.map((m) => m.userId), leader?.leaderId].filter(Boolean));
  const invalid = assigneeIds.filter((id) => !allowed.has(id));
  if (invalid.length) {
    throw new HttpError(400, "Assignees must be project members");
  }
}

async function notifyAssignees({ task, project, assigneeIds, actorId }) {
  const targets = assigneeIds.filter((id) => id !== actorId);
  if (!targets.length) return;
  const { deliverToUsers } = await import("../../lib/notify.js");
  await deliverToUsers(targets, {
    type: "TASK_ASSIGNED",
    title: `Task assigned: ${task.title}`,
    body: `${project.name} — ${task.title}`,
    data: { taskId: task.id, projectId: project.id },
  });
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function listTasksForUser(userId, filters = {}) {
  const { projectId } = filters;
  const projectIds = await accessibleProjectIds(userId, projectId);
  if (!projectIds.length) return [];

  const rows = await prisma.projectTask.findMany({
    where: buildTaskWhere(projectIds, { ...filters, viewerId: userId }),
    orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
    include: taskInclude,
  });

  return rows.map(formatTask);
}

export async function getKanbanBoard(userId, filters = {}) {
  const tasks = await listTasksForUser(userId, filters);
  const columns = {
    TODO: [],
    IN_PROGRESS: [],
    REVIEW: [],
    DONE: [],
  };
  for (const task of tasks) {
    columns[task.status]?.push(task);
  }
  return { columns, tasks };
}

export async function getMemberProgress(userId, filters = {}) {
  const projectIds = await accessibleProjectIds(userId, filters.projectId);
  if (!projectIds.length) return [];

  const where = {
    ...buildTaskWhere(projectIds, { ...filters, viewerId: userId }),
    status: { not: TaskStatus.DONE },
  };

  const tasks = await prisma.projectTask.findMany({
    where,
    include: taskInclude,
  });

  const byUser = new Map();
  for (const row of tasks) {
    const task = formatTask(row);
    const users = task.assignees.length
      ? task.assignees
      : [{ id: "unassigned", name: "Unassigned", avatar: null }];

    for (const u of users) {
      if (filters.assigneeId && u.id !== filters.assigneeId) continue;
      if (!byUser.has(u.id)) {
        byUser.set(u.id, {
          user: u.id === "unassigned" ? null : u,
          total: 0,
          inProgress: 0,
          delayed: 0,
          avgProgress: 0,
          tasks: [],
        });
      }
      const entry = byUser.get(u.id);
      entry.total += 1;
      if (task.status === TaskStatus.IN_PROGRESS) entry.inProgress += 1;
      if (task.isDelayed) entry.delayed += 1;
      entry.tasks.push(task);
    }
  }

  return Array.from(byUser.values()).map((entry) => ({
    ...entry,
    avgProgress: entry.tasks.length
      ? Math.round(entry.tasks.reduce((s, t) => s + t.progress, 0) / entry.tasks.length)
      : 0,
    tasks: entry.tasks.slice(0, 8),
  }));
}

export async function getTaskStats(userId, filters = {}) {
  const projectIds = await accessibleProjectIds(userId, filters.projectId);
  const today = startOfToday();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const now = new Date();

  if (!projectIds.length) {
    return {
      total: 0,
      myTasks: 0,
      focusToday: 0,
      blocked: 0,
      inProgress: 0,
      completedToday: 0,
      completedYesterday: 0,
      delayed: 0,
      byStatus: {},
    };
  }

  const where = buildTaskWhere(projectIds, { ...filters, viewerId: userId });
  const focusDate = today;

  const [
    total,
    myTasks,
    focusToday,
    inProgress,
    completedToday,
    completedYesterday,
    delayed,
    grouped,
  ] = await Promise.all([
    prisma.projectTask.count({ where: { ...where, status: { not: TaskStatus.DONE } } }),
    prisma.projectTask.count({
      where: {
        ...where,
        status: { not: TaskStatus.DONE },
        assignees: { some: { userId } },
      },
    }),
    prisma.todayFocusItem.count({
      where: { userId, focusDate, isDone: false, dismissedAt: null },
    }),
    prisma.projectTask.count({ where: { ...where, status: TaskStatus.IN_PROGRESS } }),
    prisma.projectTask.count({
      where: { ...where, completedAt: { gte: today } },
    }),
    prisma.projectTask.count({
      where: {
        ...where,
        completedAt: { gte: yesterday, lt: today },
      },
    }),
    prisma.projectTask.count({
      where: {
        ...where,
        status: { not: TaskStatus.DONE },
        dueDate: { lt: now },
      },
    }),
    prisma.projectTask.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    }),
  ]);

  const byStatus = Object.fromEntries(
    grouped.map((g) => [g.status, g._count._all]),
  );

  return {
    total,
    myTasks,
    focusToday,
    blocked: 0,
    inProgress,
    completedToday,
    completedYesterday,
    delayed,
    byStatus,
  };
}

export async function getTask(projectId, taskId) {
  const row = await prisma.projectTask.findFirst({
    where: { id: taskId, projectId },
    include: {
      ...taskInclude,
      progressLogs: {
        orderBy: [{ logDate: "desc" }, { loggedAt: "desc" }],
        take: 30,
        include: { user: { select: { id: true, name: true, avatar: true } } },
      },
    },
  });
  if (!row) throw new HttpError(404, "Task not found");
  const formatted = {
    ...formatTask(row),
    progressLogs: row.progressLogs.map((l) => ({
      id: l.id,
      progress: l.progress,
      hours: l.hours,
      note: l.note,
      logDate: l.logDate,
      loggedAt: l.loggedAt,
      user: l.user,
    })),
  };

  const depIds = formatted.dependsOnIds ?? [];
  if (depIds.length) {
    const deps = await prisma.projectTask.findMany({
      where: { id: { in: depIds }, projectId },
      select: { id: true, title: true, status: true },
    });
    formatted.dependencies = deps;
  } else {
    formatted.dependencies = [];
  }

  return formatted;
}

export async function createTask(projectId, userId, input) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });
  if (!project) throw new HttpError(404, "Project not found");

  const assigneeIds = input.assigneeIds ?? [];
  await assertCanAssignTask(userId, assigneeIds.length ? assigneeIds : [userId]);
  await assertAssigneesAreMembers(projectId, assigneeIds.length ? assigneeIds : [userId]);
  const finalAssignees = assigneeIds.length ? assigneeIds : [userId];

  const status = input.status ?? TaskStatus.TODO;
  const progress = input.progress ?? (status === TaskStatus.DONE ? 100 : 0);

  const task = await prisma.$transaction(async (tx) =>
    tx.projectTask.create({
      data: {
        projectId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        status,
        priority: input.priority ?? "MEDIUM",
        progress,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        createdById: userId,
        completedAt: status === TaskStatus.DONE ? new Date() : null,
        assignees: finalAssignees.length
          ? { create: finalAssignees.map((uid) => ({ userId: uid })) }
          : undefined,
      },
      include: taskInclude,
    }),
  );

  if (finalAssignees.length) {
    await notifyAssignees({ task, project, assigneeIds: finalAssignees, actorId: userId });
  }

  await logActivity({
    projectId,
    userId,
    action: "created",
    entityType: "task",
    entityId: task.id,
    newValues: { title: task.title, status: task.status },
  });

  return formatTask(task);
}

export async function updateTask(projectId, taskId, userId, input) {
  const existing = await prisma.projectTask.findFirst({
    where: { id: taskId, projectId },
    include: { assignees: true },
  });
  if (!existing) throw new HttpError(404, "Task not found");

  await assertCanEditTask(userId, existing, projectId);

  if (input.assigneeIds) {
    await assertCanAssignTask(userId, input.assigneeIds);
    await assertAssigneesAreMembers(projectId, input.assigneeIds);
  }

  const data = {};
  if (input.title !== undefined) data.title = input.title.trim();
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.priority !== undefined) data.priority = input.priority;
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
  if (input.checklist !== undefined) data.checklist = input.checklist;
  if (input.dependsOnIds !== undefined) data.dependsOnIds = input.dependsOnIds;
  if (input.dueDate !== undefined) {
    data.dueDate = input.dueDate ? new Date(input.dueDate) : null;
  }
  if (input.progress !== undefined) data.progress = input.progress;
  if (input.status !== undefined) {
    data.status = input.status;
    if (input.status === TaskStatus.DONE) {
      data.progress = input.progress ?? 100;
      data.completedAt = new Date();
    } else if (existing.status === TaskStatus.DONE) {
      data.completedAt = null;
    }
  }

  const task = await prisma.$transaction(async (tx) => {
    if (input.assigneeIds) {
      await tx.taskAssignee.deleteMany({ where: { taskId } });
      if (input.assigneeIds.length) {
        await tx.taskAssignee.createMany({
          data: input.assigneeIds.map((uid) => ({ taskId, userId: uid })),
        });
      }
    }

    return tx.projectTask.update({
      where: { id: taskId },
      data,
      include: taskInclude,
    });
  });

  if (input.assigneeIds?.length) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true },
    });
    const prev = new Set(existing.assignees.map((a) => a.userId));
    const added = input.assigneeIds.filter((id) => !prev.has(id));
    if (added.length) {
      await notifyAssignees({ task, project, assigneeIds: added, actorId: userId });
    }
  }

  await logActivity({
    projectId,
    userId,
    action: "updated",
    entityType: "task",
    entityId: taskId,
    oldValues: { status: existing.status, progress: existing.progress },
    newValues: { status: task.status, progress: task.progress },
  });

  return formatTask(task);
}

export async function deleteTask(projectId, taskId, userId) {
  const existing = await prisma.projectTask.findFirst({
    where: { id: taskId, projectId },
    include: { assignees: true },
  });
  if (!existing) throw new HttpError(404, "Task not found");

  await assertCanEditTask(userId, existing, projectId);

  await prisma.projectTask.delete({ where: { id: taskId } });

  await logActivity({
    projectId,
    userId,
    action: "deleted",
    entityType: "task",
    entityId: taskId,
    oldValues: { title: existing.title },
  });
}

export async function logTaskProgress(projectId, taskId, userId, input) {
  const task = await prisma.projectTask.findFirst({
    where: { id: taskId, projectId },
  });
  if (!task) throw new HttpError(404, "Task not found");

  const logDate = input.logDate
    ? new Date(`${input.logDate}T12:00:00.000Z`)
    : startOfToday();

  const log = await prisma.$transaction(async (tx) => {
    const entry = await tx.taskProgressLog.create({
      data: {
        taskId,
        userId,
        progress: input.progress ?? task.progress,
        hours: input.hours ?? null,
        note: input.note?.trim() || null,
        logDate,
      },
      include: { user: { select: { id: true, name: true, avatar: true } } },
    });

    const updates = {};
    if (input.progress !== undefined) updates.progress = input.progress;
    if (input.progress !== undefined && input.progress >= 100) {
      updates.status = TaskStatus.DONE;
      updates.completedAt = new Date();
    } else if (task.status === TaskStatus.TODO && input.progress > 0) {
      updates.status = TaskStatus.IN_PROGRESS;
    } else if (input.hours && input.progress === undefined) {
      // hours-only log keeps task progress unchanged
    }

    if (Object.keys(updates).length) {
      await tx.projectTask.update({ where: { id: taskId }, data: updates });
    }

    return entry;
  });

  await logActivity({
    projectId,
    userId,
    action: "progress",
    entityType: "task",
    entityId: taskId,
    newValues: { progress: input.progress, note: input.note },
  });

  return {
    id: log.id,
    progress: log.progress,
    note: log.note,
    logDate: log.logDate,
    loggedAt: log.loggedAt,
    user: log.user,
  };
}

export async function listTaskProgress(projectId, taskId) {
  const task = await prisma.projectTask.findFirst({
    where: { id: taskId, projectId },
    select: { id: true },
  });
  if (!task) throw new HttpError(404, "Task not found");

  const logs = await prisma.taskProgressLog.findMany({
    where: { taskId },
    orderBy: [{ logDate: "desc" }, { loggedAt: "desc" }],
    include: { user: { select: { id: true, name: true, avatar: true } } },
  });

  return logs.map((l) => ({
    id: l.id,
    progress: l.progress,
    note: l.note,
    logDate: l.logDate,
    loggedAt: l.loggedAt,
    user: l.user,
  }));
}

export async function getProjectTaskReport(projectId) {
  const tasks = await prisma.projectTask.findMany({
    where: { projectId },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    include: taskInclude,
  });

  const progressLogs = await prisma.taskProgressLog.findMany({
    where: { task: { projectId } },
    orderBy: { logDate: "desc" },
    take: 100,
    include: {
      user: { select: { id: true, name: true } },
      task: { select: { id: true, title: true } },
    },
  });

  const stats = {
    total: tasks.length,
    todo: tasks.filter((t) => t.status === TaskStatus.TODO).length,
    inProgress: tasks.filter((t) => t.status === TaskStatus.IN_PROGRESS).length,
    review: tasks.filter((t) => t.status === TaskStatus.REVIEW).length,
    done: tasks.filter((t) => t.status === TaskStatus.DONE).length,
    avgProgress: tasks.length
      ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length)
      : 0,
  };

  return {
    stats,
    tasks: tasks.map(formatTask),
    recentProgress: progressLogs.map((l) => ({
      id: l.id,
      progress: l.progress,
      note: l.note,
      logDate: l.logDate,
      user: l.user,
      task: l.task,
    })),
  };
}

export { ProjectMemberRole };
