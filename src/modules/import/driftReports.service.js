import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { logActivity } from "../activity/activity.service.js";
import { notifyDriftDetected } from "../notifications/driftNotifications.js";

const MAX_REPORTS_PER_PROJECT = 25;

function databaseLabelFromMeta(meta) {
  if (meta?.dialect === "postgres" && meta?.schema) {
    return `${meta.database}.${meta.schema}`;
  }
  return meta?.database ?? "database";
}

function serializeReportForStorage(report) {
  return {
    summary: report.summary,
    issues: (report.issues ?? []).slice(0, 200),
    meta: report.meta,
    migration: report.migration
      ? {
          dialect: report.migration.dialect,
          statementCount: report.migration.statementCount,
          sql: report.migration.sql,
          statements: report.migration.statements ?? [],
          hasOptionalDrops: report.migration.hasOptionalDrops ?? false,
        }
      : null,
  };
}

export async function saveDriftReport(projectId, userId, report, options = {}) {
  const row = await prisma.projectDriftReport.create({
    data: {
      projectId,
      dialect: report.meta?.dialect ?? "mysql",
      databaseLabel: databaseLabelFromMeta(report.meta),
      inSync: Boolean(report.summary?.inSync),
      issueCount: report.summary?.issueCount ?? 0,
      reportJson: serializeReportForStorage(report),
      checkedById: userId,
    },
    include: {
      checkedBy: { select: { id: true, name: true, email: true } },
    },
  });

  const old = await prisma.projectDriftReport.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    skip: MAX_REPORTS_PER_PROJECT,
    select: { id: true },
  });
  if (old.length) {
    await prisma.projectDriftReport.deleteMany({
      where: { id: { in: old.map((r) => r.id) } },
    });
  }

  const formatted = formatDriftReportRow(row);

  if (options.notify !== false && !report.summary?.inSync) {
    try {
      await notifyDriftDetected({
        projectId,
        actorId: userId,
        issueCount: report.summary?.issueCount ?? 0,
        databaseLabel: formatted.databaseLabel,
        inSync: false,
        source: options.source ?? "manual",
      });
    } catch {
      /* notifications are best-effort */
    }
  }

  try {
    await logActivity({
      projectId,
      userId,
      action: report.summary?.inSync ? "checked" : "drift_detected",
      entityType: "schema_drift",
      entityId: row.id,
      newValues: {
        inSync: Boolean(report.summary?.inSync),
        issueCount: report.summary?.issueCount ?? 0,
        databaseLabel: formatted.databaseLabel,
        source: options.source ?? "manual",
      },
    });
  } catch {
    /* activity is best-effort */
  }

  return formatted;
}

export function formatDriftReportRow(row) {
  if (!row) return null;
  const json = row.reportJson ?? {};
  return {
    id: row.id,
    dialect: row.dialect,
    databaseLabel: row.databaseLabel,
    inSync: row.inSync,
    issueCount: row.issueCount,
    checkedAt: row.createdAt,
    checkedBy: row.checkedBy ?? null,
    summary: json.summary ?? null,
    issues: json.issues ?? [],
    meta: json.meta ?? null,
    migration: json.migration ?? null,
  };
}

export async function getLatestDriftReport(projectId) {
  const row = await prisma.projectDriftReport.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    include: {
      checkedBy: { select: { id: true, name: true, email: true } },
    },
  });
  return formatDriftReportRow(row);
}

export async function getDriftReportById(projectId, reportId) {
  const row = await prisma.projectDriftReport.findFirst({
    where: { id: reportId, projectId },
    include: {
      checkedBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!row) {
    throw new HttpError(404, "Drift report not found");
  }
  return formatDriftReportRow(row);
}

export async function listDriftReports(projectId, limit = 10) {
  const rows = await prisma.projectDriftReport.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 25),
    include: {
      checkedBy: { select: { id: true, name: true, email: true } },
    },
  });
  return rows.map(formatDriftReportRow);
}

export function driftSummaryForHealth(latest) {
  if (!latest) {
    return { checked: false, inSync: null, issueCount: 0, checkedAt: null, databaseLabel: null, dialect: null };
  }
  return {
    checked: true,
    inSync: latest.inSync,
    issueCount: latest.issueCount,
    checkedAt: latest.checkedAt,
    databaseLabel: latest.databaseLabel,
    dialect: latest.dialect,
  };
}
