import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { validateErdSchema } from "../../lib/erdValidation.js";
import { computeProjectHealthStage } from "./projectHealthStage.js";
import { computeProjectHealthDashboard } from "./projectHealthDashboard.js";
import { getLatestDriftReport, driftSummaryForHealth } from "../import/driftReports.service.js";

export async function refreshProjectHealth(projectId) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      createdAt: true,
      lastActivityAt: true,
      _count: { select: { erdTables: true, erdRelations: true, comments: true } },
      apiGroups: { select: { _count: { select: { routes: true } } } },
      activityLogs: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
  });
  if (!project) return null;

  const routeCount = project.apiGroups.reduce((sum, g) => sum + g._count.routes, 0);
  const lastActivityAt = project.activityLogs[0]?.createdAt ?? project.lastActivityAt ?? project.createdAt;

  const healthStage = computeProjectHealthStage({
    lastActivityAt,
    createdAt: project.createdAt,
    tableCount: project._count.erdTables,
    relationCount: project._count.erdRelations,
    routeCount,
    commentCount: project._count.comments,
  });

  await prisma.project.update({
    where: { id: projectId },
    data: { healthStage, lastActivityAt },
  });

  return healthStage;
}

async function loadProjectHealthStats(projectId) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      healthStage: true,
      _count: { select: { erdTables: true, erdRelations: true, members: true, apiGroups: true } },
      apiGroups: { select: { _count: { select: { routes: true } } } },
      erdTables: { select: { _count: { select: { columns: true } } } },
    },
  });

  if (!project) {
    throw new HttpError(404, "Project not found");
  }

  const statistics = {
    tables: project._count.erdTables,
    relations: project._count.erdRelations,
    apiGroups: project._count.apiGroups,
    apiRoutes: project.apiGroups.reduce((sum, g) => sum + g._count.routes, 0),
    members: project._count.members,
    columns: project.erdTables.reduce((sum, t) => sum + t._count.columns, 0),
  };

  return { healthStage: project.healthStage, statistics };
}

async function loadErdValidationSummary(projectId) {
  const [tables, relations] = await Promise.all([
    prisma.erdTable.findMany({
      where: { projectId },
      include: { columns: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.erdRelation.findMany({ where: { projectId } }),
  ]);

  const validation = validateErdSchema(tables, relations);
  const errors = validation.issues.filter((i) => i.severity === "error").length;
  const warnings = validation.issues.filter((i) => i.severity === "warning").length;

  return {
    issues: validation.issues,
    summary: { errors, warnings, total: validation.issues.length },
  };
}

export async function getProjectHealth(projectId) {
  const [base, openComments, erdValidation, recentActivity, latestDrift] = await Promise.all([
    loadProjectHealthStats(projectId),
    prisma.comment.count({
      where: { projectId, resolvedAt: null, parentId: null },
    }),
    loadErdValidationSummary(projectId),
    prisma.activityLog.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, action: true, entityType: true, createdAt: true },
    }),
    getLatestDriftReport(projectId).catch(() => null),
  ]);

  const driftSummary = driftSummaryForHealth(latestDrift);

  const dashboard = computeProjectHealthDashboard(
    base.statistics,
    openComments,
    erdValidation.summary,
    driftSummary,
  );

  return {
    healthStage: base.healthStage,
    statistics: base.statistics,
    openComments,
    overall: dashboard.overall,
    categories: dashboard.categories,
    issues: dashboard.issues,
    isEmptyShell: dashboard.isEmptyShell,
    drift: driftSummary,
    latestDriftReport: latestDrift,
    erdValidation,
    recentActivity,
  };
}
