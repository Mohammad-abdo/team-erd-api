import { DailyReportScope, TaskStatus, TeamRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { isPlatformAdmin } from "../../middleware/adminAccess.js";
import { enrichUserProfile } from "../../lib/userProfile.js";
import { addMemberDirect } from "../projects/members.service.js";

function startOfToday() {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  return d;
}

function toDateOnly(input) {
  if (!input) return startOfToday();
  return new Date(`${input}T12:00:00.000Z`);
}

async function sharedTeamIds(userA, userB) {
  const [aTeams, bTeams] = await Promise.all([
    prisma.teamMember.findMany({ where: { userId: userA }, select: { teamId: true } }),
    prisma.teamMember.findMany({ where: { userId: userB }, select: { teamId: true } }),
  ]);
  const bSet = new Set(bTeams.map((t) => t.teamId));
  return aTeams.map((t) => t.teamId).filter((id) => bSet.has(id));
}

async function assertCanViewProfile(viewerId, targetUserId) {
  if (viewerId === targetUserId) return { isSelf: true, isLead: false, sharedTeams: [] };
  const admin = await isPlatformAdmin(viewerId);
  if (admin) return { isSelf: false, isLead: true, sharedTeams: [] };

  const shared = await sharedTeamIds(viewerId, targetUserId);
  if (!shared.length) {
    const sharedProjects = await prisma.projectMember.findMany({
      where: { userId: viewerId, project: { members: { some: { userId: targetUserId } } } },
      select: { projectId: true },
    });
    if (!sharedProjects.length) {
      throw new HttpError(403, "You do not have access to this profile");
    }
    return { isSelf: false, isLead: false, sharedTeams: [] };
  }

  const leadOnShared = await prisma.teamMember.findFirst({
    where: { userId: viewerId, teamId: { in: shared }, role: TeamRole.TEAM_LEAD },
  });

  return { isSelf: false, isLead: Boolean(leadOnShared), sharedTeams: shared };
}

async function assertCanRate(reviewerId, targetUserId, teamId) {
  if (reviewerId === targetUserId) throw new HttpError(400, "Cannot rate yourself");
  const admin = await isPlatformAdmin(reviewerId);
  if (admin) return;

  if (!teamId) throw new HttpError(400, "teamId required for ratings");

  const lead = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: reviewerId } },
  });
  if (!lead || lead.role !== TeamRole.TEAM_LEAD) {
    throw new HttpError(403, "Only team leads can rate members");
  }

  const targetMember = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: targetUserId } },
  });
  if (!targetMember) throw new HttpError(400, "User is not in this team");
}

function serializeProjectTask(task) {
  const now = new Date();
  const isOverdue = task.dueDate
    && task.status !== TaskStatus.DONE
    && new Date(task.dueDate) < now;

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    progress: task.progress,
    dueDate: task.dueDate,
    completedAt: task.completedAt,
    updatedAt: task.updatedAt,
    isOverdue: Boolean(isOverdue),
    project: task.project,
    recentProgress: (task.progressLogs ?? []).map((log) => ({
      id: log.id,
      progress: log.progress,
      note: log.note,
      logDate: log.logDate,
      loggedAt: log.loggedAt,
    })),
  };
}

function buildMemberWorkReport({
  user,
  projects,
  stats,
  projectTasks,
  dailyTasks,
  progressLogs,
  ratings,
  reports,
  activity,
  activityTotal,
  reportsTotal,
  weekAgo,
  today,
}) {
  const projectTasksDone = projectTasks.filter((t) => t.status === TaskStatus.DONE).length;
  const projectTasksActive = projectTasks.filter((t) => t.status !== TaskStatus.DONE).length;
  const projectTasksOverdue = projectTasks.filter((t) => t.isOverdue).length;
  const dailyTasksTotal = Object.values(stats.dailyTasksWeek ?? {}).reduce((a, b) => a + b, 0);

  return {
    generatedAt: new Date().toISOString(),
    member: { id: user.id, name: user.name, email: user.email, avatar: user.avatar ?? null },
    period: {
      from: weekAgo.toISOString(),
      to: today.toISOString(),
      label: "Last 7 days",
    },
    summary: {
      projects: projects.length,
      projectTasksTotal: projectTasks.length,
      projectTasksDone,
      projectTasksActive,
      projectTasksOverdue,
      dailyTasksWeek: dailyTasksTotal,
      dailyTasksPendingToday: stats.dailyTasksPendingToday,
      progressLogsCount: progressLogs.length,
      avgRating: stats.ratingsAvg,
      ratingsCount: stats.ratingsCount,
      standupReports: reportsTotal,
      activityEvents: activityTotal,
    },
    taskBreakdown: stats.projectTasks,
    dailyTaskBreakdown: stats.dailyTasksWeek,
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      role: p.role,
      healthStage: p.healthStage,
      tasksAssigned: projectTasks.filter((t) => t.project?.id === p.id).length,
    })),
    highlights: {
      recentActivity: activity.slice(0, 15),
      recentRatings: ratings.slice(0, 5),
      recentStandups: reports.slice(0, 5),
      recentProgress: progressLogs.slice(0, 10),
    },
  };
}

export async function getMemberProfile(viewerId, targetUserId) {
  const access = await assertCanViewProfile(viewerId, targetUserId);
  const user = await enrichUserProfile(targetUserId);
  if (!user) throw new HttpError(404, "User not found");

  const today = startOfToday();
  const weekAgo = new Date(today);
  weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);

  const twoWeeksAgo = new Date(today);
  twoWeeksAgo.setUTCDate(twoWeeksAgo.getUTCDate() - 14);

  const [
    projectMemberships,
    taskStats,
    dailyTaskWeek,
    ratings,
    reports,
    recentActivity,
    dailyToday,
    projectTasks,
    dailyTasks,
    progressLogs,
    reportsTotal,
    activityTotal,
  ] = await Promise.all([
    prisma.projectMember.findMany({
      where: { userId: targetUserId },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            slug: true,
            healthStage: true,
            visibility: true,
            leaderId: true,
            _count: { select: { erdTables: true, members: true } },
          },
        },
      },
      orderBy: { joinedAt: "desc" },
    }),
    prisma.projectTask.groupBy({
      by: ["status"],
      where: { assignees: { some: { userId: targetUserId } } },
      _count: { _all: true },
    }),
    prisma.dailyTask.groupBy({
      by: ["status"],
      where: { assigneeId: targetUserId, taskDate: { gte: weekAgo } },
      _count: { _all: true },
    }),
    prisma.memberRating.findMany({
      where: { userId: targetUserId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        reviewer: { select: { id: true, name: true, avatar: true } },
        team: { select: { id: true, name: true, color: true } },
        project: { select: { id: true, name: true } },
      },
    }),
    prisma.dailyReport.findMany({
      where: { userId: targetUserId },
      orderBy: [{ reportDate: "desc" }, { createdAt: "desc" }],
      take: 15,
      include: {
        team: { select: { id: true, name: true, color: true } },
        project: { select: { id: true, name: true, slug: true } },
      },
    }),
    prisma.activityLog.findMany({
      where: { userId: targetUserId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
        project: { select: { id: true, name: true } },
      },
    }),
    prisma.dailyTask.count({
      where: { assigneeId: targetUserId, taskDate: today, status: { not: TaskStatus.DONE } },
    }),
    prisma.projectTask.findMany({
      where: { assignees: { some: { userId: targetUserId } } },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { updatedAt: "desc" }],
      take: 100,
      include: {
        project: { select: { id: true, name: true, slug: true } },
        progressLogs: {
          where: { userId: targetUserId },
          orderBy: { loggedAt: "desc" },
          take: 3,
        },
      },
    }),
    prisma.dailyTask.findMany({
      where: { assigneeId: targetUserId, taskDate: { gte: twoWeeksAgo } },
      orderBy: [{ taskDate: "desc" }, { createdAt: "desc" }],
      take: 60,
      include: {
        team: { select: { id: true, name: true, color: true } },
      },
    }),
    prisma.taskProgressLog.findMany({
      where: { userId: targetUserId },
      orderBy: { loggedAt: "desc" },
      take: 40,
      include: {
        task: {
          select: {
            id: true,
            title: true,
            projectId: true,
            project: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    }),
    prisma.dailyReport.count({ where: { userId: targetUserId } }),
    prisma.activityLog.count({ where: { userId: targetUserId } }),
  ]);

  const ratingAgg = await prisma.memberRating.aggregate({
    where: { userId: targetUserId },
    _avg: { score: true },
    _count: { _all: true },
  });

  const projects = projectMemberships.map((m) => ({
    id: m.project.id,
    name: m.project.name,
    slug: m.project.slug,
    role: m.role,
    healthStage: m.project.healthStage,
    visibility: m.project.visibility,
    isLeader: m.project.leaderId === targetUserId,
    tableCount: m.project._count.erdTables,
    memberCount: m.project._count.members,
    joinedAt: m.joinedAt,
  }));

  const projectTasksByStatus = Object.fromEntries(
    taskStats.map((g) => [g.status, g._count._all]),
  );
  const dailyTasksByStatus = Object.fromEntries(
    dailyTaskWeek.map((g) => [g.status, g._count._all]),
  );

  let leadTeamIds = [];
  if (access.isSelf) {
    const myLeads = await prisma.teamMember.findMany({
      where: { userId: viewerId, role: TeamRole.TEAM_LEAD },
      select: { teamId: true },
    });
    leadTeamIds = myLeads.map((m) => m.teamId);
  } else if (access.isLead) {
    leadTeamIds = access.sharedTeams;
  } else if (await isPlatformAdmin(viewerId)) {
    leadTeamIds = user.teams?.map((t) => t.id) ?? [];
  }

  const assignableProjects = leadTeamIds.length
    ? await prisma.teamProject.findMany({
        where: { teamId: { in: leadTeamIds } },
        include: { project: { select: { id: true, name: true, slug: true } } },
      })
    : [];

  const rateableTeams = access.isSelf
    ? []
    : access.isLead
      ? user.teams?.filter((t) => access.sharedTeams.includes(t.id)) ?? []
      : (await isPlatformAdmin(viewerId))
        ? user.teams ?? []
        : [];

  const serializedProjectTasks = projectTasks.map(serializeProjectTask);
  const serializedDailyTasks = dailyTasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    taskDate: t.taskDate,
    source: t.source,
    completedAt: t.completedAt,
    team: t.team,
  }));
  const serializedProgressLogs = progressLogs.map((log) => ({
    id: log.id,
    progress: log.progress,
    note: log.note,
    logDate: log.logDate,
    loggedAt: log.loggedAt,
    task: log.task,
  }));

  const statsPayload = {
    projectTasks: projectTasksByStatus,
    dailyTasksWeek: dailyTasksByStatus,
    dailyTasksPendingToday: dailyToday,
    ratingsAvg: ratingAgg._avg.score ? Math.round(ratingAgg._avg.score * 10) / 10 : null,
    ratingsCount: ratingAgg._count._all,
    reportsCount: reportsTotal,
    activityTotal,
  };

  const reportsPayload = reports.map((r) => ({
    id: r.id,
    scope: r.scope,
    reportDate: r.reportDate,
    summary: r.summary,
    tasksDone: r.tasksDone,
    blockers: r.blockers,
    nextPlan: r.nextPlan,
    hoursWorked: r.hoursWorked,
    mood: r.mood,
    createdAt: r.createdAt,
    team: r.team,
    project: r.project,
  }));

  const ratingsPayload = ratings.map((r) => ({
    id: r.id,
    score: r.score,
    comment: r.comment,
    createdAt: r.createdAt,
    reviewer: r.reviewer,
    team: r.team,
    project: r.project,
  }));

  const workReport = buildMemberWorkReport({
    user,
    projects,
    stats: statsPayload,
    projectTasks: serializedProjectTasks,
    dailyTasks: serializedDailyTasks,
    progressLogs: serializedProgressLogs,
    ratings: ratingsPayload,
    reports: reportsPayload,
    activity: recentActivity,
    activityTotal,
    reportsTotal,
    weekAgo,
    today,
  });

  return {
    user,
    projects,
    stats: statsPayload,
    projectTasks: serializedProjectTasks,
    dailyTasks: serializedDailyTasks,
    progressLogs: serializedProgressLogs,
    workReport,
    ratings: ratingsPayload,
    reports: reportsPayload,
    activity: recentActivity,
    permissions: {
      isSelf: access.isSelf,
      canRate: (!access.isSelf && (access.isLead || (await isPlatformAdmin(viewerId)))),
      canAssignProject: leadTeamIds.length > 0,
      canSubmitReport: access.isSelf,
      sharedTeams: access.sharedTeams,
      leadTeamIds,
    },
    rateableTeams,
    assignableProjects: assignableProjects.map((tp) => tp.project),
  };
}

export async function createMemberRating(reviewerId, targetUserId, input) {
  await assertCanRate(reviewerId, targetUserId, input.teamId);

  const rating = await prisma.memberRating.create({
    data: {
      userId: targetUserId,
      reviewerId,
      teamId: input.teamId ?? null,
      projectId: input.projectId ?? null,
      score: input.score,
      comment: input.comment?.trim() || null,
    },
    include: {
      reviewer: { select: { id: true, name: true, avatar: true } },
      team: { select: { id: true, name: true, color: true } },
      project: { select: { id: true, name: true } },
    },
  });

  await prisma.notification.create({
    data: {
      userId: targetUserId,
      type: "MEMBER_RATED",
      title: `New rating: ${input.score}/5`,
      body: rating.comment ?? `You received a ${input.score}-star rating`,
      data: { ratingId: rating.id, reviewerId },
    },
  });

  return rating;
}

export async function listMemberRatings(viewerId, targetUserId) {
  await assertCanViewProfile(viewerId, targetUserId);
  const rows = await prisma.memberRating.findMany({
    where: { userId: targetUserId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      reviewer: { select: { id: true, name: true, avatar: true } },
      team: { select: { id: true, name: true, color: true } },
      project: { select: { id: true, name: true } },
    },
  });
  return rows;
}

export async function createDailyReport(userId, input) {
  const reportDate = toDateOnly(input.reportDate);
  let scope = input.scope ?? DailyReportScope.GENERAL;
  if (input.projectId) scope = DailyReportScope.PROJECT;
  if (scope === DailyReportScope.TASKS && !input.teamId) {
    throw new HttpError(400, "teamId required for task reports");
  }

  if (input.teamId) {
    const member = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: input.teamId, userId } },
    });
    if (!member) throw new HttpError(403, "Not a member of this team");
  }

  if (input.projectId) {
    const pm = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: input.projectId, userId } },
    });
    const project = await prisma.project.findUnique({
      where: { id: input.projectId },
      select: { leaderId: true },
    });
    if (!pm && project?.leaderId !== userId) {
      throw new HttpError(403, "Not a member of this project");
    }
  }

  const report = await prisma.dailyReport.create({
    data: {
      userId,
      teamId: input.teamId ?? null,
      projectId: input.projectId ?? null,
      scope,
      reportDate,
      summary: input.summary.trim(),
      tasksDone: input.tasksDone?.trim() || null,
      blockers: input.blockers?.trim() || null,
      nextPlan: input.nextPlan?.trim() || null,
      hoursWorked: input.hoursWorked ?? null,
      mood: input.mood ?? null,
    },
    include: {
      team: { select: { id: true, name: true, color: true } },
      project: { select: { id: true, name: true, slug: true } },
      user: { select: { id: true, name: true, avatar: true } },
    },
  });

  if (input.teamId) {
    const leads = await prisma.teamMember.findMany({
      where: { teamId: input.teamId, role: TeamRole.TEAM_LEAD },
      select: { userId: true },
    });
    if (leads.length) {
      await prisma.notification.createMany({
        data: leads
          .filter((l) => l.userId !== userId)
          .map((l) => ({
            userId: l.userId,
            type: "DAILY_REPORT",
            title: `Daily report from ${report.user.name}`,
            body: report.summary.slice(0, 120),
            data: { reportId: report.id, userId, teamId: input.teamId },
          })),
      });
    }
  }

  return report;
}

export async function listDailyReports(viewerId, { userId, teamId, projectId, date, limit = 30 } = {}) {
  const targetUserId = userId ?? viewerId;
  if (targetUserId !== viewerId) {
    await assertCanViewProfile(viewerId, targetUserId);
  }

  const where = { userId: targetUserId };
  if (teamId) where.teamId = teamId;
  if (projectId) where.projectId = projectId;
  if (date) where.reportDate = toDateOnly(date);

  const take = Math.min(Math.max(Number(limit) || 30, 1), 100);

  return prisma.dailyReport.findMany({
    where,
    orderBy: [{ reportDate: "desc" }, { createdAt: "desc" }],
    take,
    include: {
      user: { select: { id: true, name: true, avatar: true } },
      team: { select: { id: true, name: true, color: true } },
      project: { select: { id: true, name: true, slug: true } },
    },
  });
}

export async function assignMemberToProject(leadId, teamId, targetUserId, { projectId, role }) {
  const admin = await isPlatformAdmin(leadId);
  if (!admin) {
    const lead = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: leadId } },
    });
    if (!lead || lead.role !== TeamRole.TEAM_LEAD) {
      throw new HttpError(403, "Team lead required");
    }
  }

  const targetMember = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: targetUserId } },
  });
  if (!targetMember) throw new HttpError(400, "User is not in this team");

  const teamProject = await prisma.teamProject.findUnique({
    where: { teamId_projectId: { teamId, projectId } },
  });
  if (!teamProject && !admin) {
    throw new HttpError(400, "Project is not assigned to this team");
  }

  const member = await addMemberDirect({
    projectId,
    userId: targetUserId,
    role: role ?? "EDITOR",
    addedById: leadId,
    asAdmin: admin,
  });

  return member;
}

export async function listTeamMemberDirectory(viewerId, teamId) {
  const member = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: viewerId } },
  });
  const admin = await isPlatformAdmin(viewerId);
  if (!member && !admin) throw new HttpError(403, "Not a team member");

  const members = await prisma.teamMember.findMany({
    where: { teamId },
    include: {
      user: { select: { id: true, name: true, email: true, avatar: true } },
    },
    orderBy: { joinedAt: "asc" },
  });

  const userIds = members.map((m) => m.userId);
  const [ratingAvgs, reportCounts] = await Promise.all([
    prisma.memberRating.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds } },
      _avg: { score: true },
      _count: { _all: true },
    }),
    prisma.dailyReport.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds } },
      _count: { _all: true },
    }),
  ]);

  const avgMap = Object.fromEntries(ratingAvgs.map((r) => [r.userId, r]));
  const reportMap = Object.fromEntries(reportCounts.map((r) => [r.userId, r._count._all]));

  return members.map((m) => ({
    userId: m.userId,
    role: m.role,
    joinedAt: m.joinedAt,
    user: m.user,
    ratingsAvg: avgMap[m.userId]?._avg.score
      ? Math.round(avgMap[m.userId]._avg.score * 10) / 10
      : null,
    ratingsCount: avgMap[m.userId]?._count._all ?? 0,
    reportsCount: reportMap[m.userId] ?? 0,
  }));
}
