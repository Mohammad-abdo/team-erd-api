import { prisma } from "../../lib/prisma.js";
import { getDbProfile } from "./dbProfiles.service.js";
import { checkDrift } from "./drift.service.js";
import { sendEmail, isEmailConfigured } from "../../lib/email.js";
import { config } from "../../config/index.js";

export async function getDriftSchedule(projectId) {
  const row = await prisma.projectDriftSchedule.findUnique({
    where: { projectId },
    include: {
      profile: {
        select: {
          id: true,
          name: true,
          environment: true,
          dialect: true,
          database: true,
          host: true,
        },
      },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    enabled: row.enabled,
    utcDay: row.utcDay,
    utcHour: row.utcHour,
    profileId: row.profileId,
    profile: row.profile,
    lastRunAt: row.lastRunAt,
    lastRunStatus: row.lastRunStatus,
    lastIssueCount: row.lastIssueCount,
  };
}

export async function upsertDriftSchedule(projectId, userId, input) {
  await getDbProfile(projectId, input.profileId);

  const row = await prisma.projectDriftSchedule.upsert({
    where: { projectId },
    create: {
      projectId,
      profileId: input.profileId,
      enabled: input.enabled ?? true,
      utcDay: input.utcDay ?? 1,
      utcHour: input.utcHour ?? 6,
      createdById: userId,
    },
    update: {
      profileId: input.profileId,
      enabled: input.enabled ?? true,
      utcDay: input.utcDay ?? 1,
      utcHour: input.utcHour ?? 6,
    },
    include: {
      profile: {
        select: {
          id: true,
          name: true,
          environment: true,
          dialect: true,
          database: true,
          host: true,
        },
      },
    },
  });

  return {
    id: row.id,
    enabled: row.enabled,
    utcDay: row.utcDay,
    utcHour: row.utcHour,
    profileId: row.profileId,
    profile: row.profile,
    lastRunAt: row.lastRunAt,
    lastRunStatus: row.lastRunStatus,
    lastIssueCount: row.lastIssueCount,
  };
}

export async function deleteDriftSchedule(projectId) {
  await prisma.projectDriftSchedule.deleteMany({ where: { projectId } });
}

async function emailDriftAlert(project, schedule, report) {
  const recipients = await prisma.projectMember.findMany({
    where: {
      projectId: project.id,
      role: { in: ["LEADER", "EDITOR"] },
    },
    include: { user: { select: { email: true, name: true } } },
  });

  const emails = [
    ...new Set(
      [project.leader?.email, ...recipients.map((m) => m.user.email)].filter(Boolean),
    ),
  ];
  if (!emails.length) return;

  const subject = `[DBForge] Schema drift: ${project.name} (${report.summary?.issueCount ?? 0} issues)`;
  const overviewUrl = `${config.appUrl}/projects/${project.id}?import=1`;
  const text = [
    `Scheduled drift check found ${report.summary?.issueCount ?? 0} issue(s) in project "${project.name}".`,
    `Database profile: ${schedule.profile?.name ?? "saved profile"}`,
    `Review migration SQL: ${overviewUrl}`,
  ].join("\n");

  for (const to of emails) {
    await sendEmail({ to, subject, text }).catch(() => {});
  }
}

export async function runScheduledDriftChecks(now = new Date()) {
  const schedules = await prisma.projectDriftSchedule.findMany({
    where: { enabled: true },
    include: {
      project: { select: { id: true, name: true, leaderId: true, leader: { select: { email: true } } } },
      profile: true,
    },
  });

  let ran = 0;
  let drifted = 0;
  let errors = 0;

  for (const schedule of schedules) {
    if (now.getUTCDay() !== schedule.utcDay) continue;
    if (now.getUTCHours() !== schedule.utcHour) continue;
    if (now.getUTCMinutes() >= 10) continue;

    if (
      schedule.lastRunAt
      && schedule.lastRunAt.getUTCFullYear() === now.getUTCFullYear()
      && schedule.lastRunAt.getUTCMonth() === now.getUTCMonth()
      && schedule.lastRunAt.getUTCDate() === now.getUTCDate()
      && schedule.lastRunAt.getUTCHours() === schedule.utcHour
    ) {
      continue;
    }

    ran += 1;
    try {
      const report = await checkDrift(
        schedule.projectId,
        schedule.createdById,
        schedule.profile.dialect,
        { profileId: schedule.profileId },
        { notify: true, source: "scheduled" },
      );

      const status = report.summary?.inSync ? "in_sync" : "drift";
      if (!report.summary?.inSync) drifted += 1;

      await prisma.projectDriftSchedule.update({
        where: { id: schedule.id },
        data: {
          lastRunAt: now,
          lastRunStatus: status,
          lastIssueCount: report.summary?.issueCount ?? 0,
        },
      });

      if (!report.summary?.inSync && isEmailConfigured()) {
        await emailDriftAlert(schedule.project, schedule, report);
      }
    } catch (err) {
      errors += 1;
      await prisma.projectDriftSchedule.update({
        where: { id: schedule.id },
        data: {
          lastRunAt: now,
          lastRunStatus: "error",
          lastIssueCount: null,
        },
      });
      console.error(`[drift-cron] Project ${schedule.projectId}:`, err.message);
    }
  }

  return { ran, drifted, errors };
}
