import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { sendEmail, isEmailConfigured } from "../../lib/email.js";
import { config } from "../../config/index.js";
import {
  executeCustomReport,
  formatCustomReportMarkdown,
  getReportDefinition,
  normalizeEmails,
} from "./customReport.service.js";

function scheduleMatchesNow(row, now = new Date()) {
  if (!row.enabled) return false;
  if (now.getUTCMinutes() >= 10) return false;
  if (row.utcHour !== now.getUTCHours()) return false;
  if (row.cadence === "WEEKLY" && row.utcDay !== now.getUTCDay()) return false;
  if (row.lastRunAt) {
    const last = new Date(row.lastRunAt);
    if (
      last.getUTCFullYear() === now.getUTCFullYear()
      && last.getUTCMonth() === now.getUTCMonth()
      && last.getUTCDate() === now.getUTCDate()
      && last.getUTCHours() === now.getUTCHours()
    ) {
      return false;
    }
  }
  return true;
}

export async function listScheduledReports() {
  const rows = await prisma.scheduledReport.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      definition: {
        select: { id: true, name: true, scope: true, format: true, projectId: true },
      },
      createdBy: { select: { id: true, name: true, email: true } },
      runs: {
        orderBy: { ranAt: "desc" },
        take: 3,
        select: { id: true, status: true, ranAt: true, summary: true },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    definitionId: row.definitionId,
    definition: row.definition,
    enabled: row.enabled,
    cadence: row.cadence,
    utcDay: row.utcDay,
    utcHour: row.utcHour,
    recipientEmails: row.recipientEmails,
    lastRunAt: row.lastRunAt,
    lastRunStatus: row.lastRunStatus,
    recentRuns: row.runs,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export async function createScheduledReport(userId, input) {
  await getReportDefinition(input.definitionId);
  return prisma.scheduledReport.create({
    data: {
      definitionId: input.definitionId,
      enabled: input.enabled ?? true,
      cadence: input.cadence,
      utcDay: input.utcDay ?? 1,
      utcHour: input.utcHour ?? 8,
      recipientEmails: normalizeEmails(input.recipientEmails),
      createdById: userId,
    },
  });
}

export async function updateScheduledReport(id, input) {
  const existing = await prisma.scheduledReport.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Scheduled report not found");

  return prisma.scheduledReport.update({
    where: { id },
    data: {
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.cadence !== undefined ? { cadence: input.cadence } : {}),
      ...(input.utcDay !== undefined ? { utcDay: input.utcDay } : {}),
      ...(input.utcHour !== undefined ? { utcHour: input.utcHour } : {}),
      ...(input.recipientEmails !== undefined
        ? { recipientEmails: normalizeEmails(input.recipientEmails) }
        : {}),
    },
  });
}

export async function deleteScheduledReport(id) {
  const existing = await prisma.scheduledReport.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Scheduled report not found");
  await prisma.scheduledReport.delete({ where: { id } });
}

async function deliverScheduledReport(schedule, definition) {
  const payload = await executeCustomReport(definition);
  const body = payload.markdown ?? formatCustomReportMarkdown(payload);
  const recipients = Array.isArray(schedule.recipientEmails) ? schedule.recipientEmails : [];

  for (const to of recipients) {
    await sendEmail({
      to,
      subject: `[DBForge] ${definition.name}`,
      text: body,
      html: `<pre style="font-family:monospace;white-space:pre-wrap">${body.replace(/</g, "&lt;")}</pre>`,
    });
  }

  return {
    recipients: recipients.length,
    emailMode: isEmailConfigured() ? "smtp" : "console",
    projectCount: payload.projectCount,
    metrics: definition.metrics,
  };
}

export async function runScheduledReportById(id) {
  const schedule = await prisma.scheduledReport.findUnique({
    where: { id },
    include: { definition: true },
  });
  if (!schedule) throw new HttpError(404, "Scheduled report not found");

  try {
    const summary = await deliverScheduledReport(schedule, schedule.definition);
    await prisma.$transaction([
      prisma.scheduledReport.update({
        where: { id },
        data: { lastRunAt: new Date(), lastRunStatus: "success" },
      }),
      prisma.scheduledReportRun.create({
        data: { scheduledReportId: id, status: "success", summary },
      }),
    ]);
    return { ok: true, summary };
  } catch (err) {
    await prisma.$transaction([
      prisma.scheduledReport.update({
        where: { id },
        data: { lastRunAt: new Date(), lastRunStatus: "failed" },
      }),
      prisma.scheduledReportRun.create({
        data: {
          scheduledReportId: id,
          status: "failed",
          error: err.message ?? "Scheduled report failed",
        },
      }),
    ]);
    throw err;
  }
}

export async function runDueScheduledReports(now = new Date()) {
  if (!config.scheduledReportCron) {
    return { ran: 0, skipped: true };
  }

  const schedules = await prisma.scheduledReport.findMany({
    where: { enabled: true },
    include: { definition: true },
  });

  let ran = 0;
  for (const schedule of schedules) {
    if (!scheduleMatchesNow(schedule, now)) continue;
    try {
      await runScheduledReportById(schedule.id);
      ran += 1;
    } catch (err) {
      console.error(`[report-cron] Schedule ${schedule.id} failed:`, err.message);
    }
  }

  return { ran, emailConfigured: isEmailConfigured() };
}
