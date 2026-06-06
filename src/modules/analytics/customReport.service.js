import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { AVAILABLE_METRICS } from "./analytics.schemas.js";

function normalizeEmails(emails) {
  return [...new Set(emails.map((e) => e.trim().toLowerCase()))];
}

async function resolveProjectIds(definition) {
  const filters = definition.filters ?? {};
  if (definition.scope === "PROJECT" && definition.projectId) {
    return [definition.projectId];
  }

  const where = {};
  if (filters.visibility) where.visibility = filters.visibility;
  if (filters.projectIds?.length) where.id = { in: filters.projectIds };
  if (filters.teamId) {
    where.teamProjects = { some: { teamId: filters.teamId } };
  }

  const rows = await prisma.project.findMany({
    where,
    select: { id: true, name: true, slug: true, visibility: true },
    orderBy: { name: "asc" },
  });
  return rows;
}

async function collectProjects(projectRows) {
  return {
    count: projectRows.length,
    items: projectRows.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      visibility: p.visibility,
    })),
  };
}

async function collectTables(projectIds) {
  const count = await prisma.erdTable.count({ where: { projectId: { in: projectIds } } });
  const byProject = await prisma.erdTable.groupBy({
    by: ["projectId"],
    where: { projectId: { in: projectIds } },
    _count: { _all: true },
  });
  return { count, byProject };
}

async function collectRelations(projectIds) {
  const count = await prisma.erdRelation.count({ where: { projectId: { in: projectIds } } });
  return { count };
}

async function collectApiRoutes(projectIds) {
  const count = await prisma.apiRoute.count({
    where: { group: { projectId: { in: projectIds } } },
  });
  return { count };
}

async function collectComments(projectIds) {
  const count = await prisma.comment.count({ where: { projectId: { in: projectIds } } });
  return { count };
}

async function collectActivity(projectIds) {
  const count = await prisma.activityLog.count({ where: { projectId: { in: projectIds } } });
  const recent = await prisma.activityLog.findMany({
    where: { projectId: { in: projectIds } },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { user: { select: { id: true, name: true } }, project: { select: { name: true } } },
  });
  return {
    count,
    recent: recent.map((row) => ({
      project: row.project?.name,
      user: row.user?.name ?? "System",
      action: row.action,
      entityType: row.entityType,
      createdAt: row.createdAt,
    })),
  };
}

async function collectTasks(projectIds) {
  const [total, open, done] = await Promise.all([
    prisma.projectTask.count({ where: { projectId: { in: projectIds } } }),
    prisma.projectTask.count({
      where: { projectId: { in: projectIds }, status: { not: "DONE" } },
    }),
    prisma.projectTask.count({
      where: { projectId: { in: projectIds }, status: "DONE" },
    }),
  ]);
  return { total, open, done };
}

async function collectMembers(projectIds) {
  const count = await prisma.projectMember.count({ where: { projectId: { in: projectIds } } });
  return { count };
}

async function collectDrift(projectIds) {
  const reports = await prisma.projectDriftReport.findMany({
    where: { projectId: { in: projectIds } },
    orderBy: { createdAt: "desc" },
    distinct: ["projectId"],
    include: { project: { select: { name: true } } },
  });
  return {
    count: reports.length,
    latest: reports.map((row) => ({
      project: row.project.name,
      inSync: row.inSync,
      issueCount: row.issueCount,
      checkedAt: row.createdAt,
    })),
  };
}

const COLLECTORS = {
  projects: async (_projectIds, projectRows) => collectProjects(projectRows),
  tables: async (projectIds) => collectTables(projectIds),
  relations: async (projectIds) => collectRelations(projectIds),
  api_routes: async (projectIds) => collectApiRoutes(projectIds),
  comments: async (projectIds) => collectComments(projectIds),
  activity: async (projectIds) => collectActivity(projectIds),
  tasks: async (projectIds) => collectTasks(projectIds),
  members: async (projectIds) => collectMembers(projectIds),
  drift: async (projectIds) => collectDrift(projectIds),
};

export function formatCustomReportMarkdown(payload) {
  const lines = [
    `# ${payload.definition.name}`,
    "",
    payload.definition.description ? `${payload.definition.description}\n` : "",
    `Generated: ${payload.generatedAt}`,
    "",
  ].filter(Boolean);

  for (const [key, section] of Object.entries(payload.sections)) {
    lines.push(`## ${key.replace(/_/g, " ")}`);
    if (section.count !== undefined) lines.push(`- Count: **${section.count}**`);
    if (section.total !== undefined) {
      lines.push(`- Total: **${section.total}** · Open: **${section.open ?? 0}** · Done: **${section.done ?? 0}**`);
    }
    if (section.items?.length) {
      for (const item of section.items.slice(0, 10)) {
        lines.push(`- ${item.name} (\`${item.slug}\`) · ${item.visibility}`);
      }
    }
    if (section.recent?.length) {
      for (const row of section.recent.slice(0, 8)) {
        lines.push(`- ${row.project}: ${row.user} ${row.action} ${row.entityType}`);
      }
    }
    if (section.latest?.length) {
      for (const row of section.latest) {
        lines.push(`- ${row.project}: ${row.inSync ? "in sync" : `${row.issueCount} issue(s)`}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

export async function executeCustomReport(definition) {
  const projectRows = await resolveProjectIds(definition);
  const projectIds = projectRows.map((p) => p.id);

  const sections = {};
  for (const metric of definition.metrics) {
    if (!AVAILABLE_METRICS.includes(metric) || !COLLECTORS[metric]) continue;
    sections[metric] = await COLLECTORS[metric](projectIds, projectRows);
  }

  const payload = {
    definition: {
      id: definition.id,
      name: definition.name,
      description: definition.description,
      scope: definition.scope,
      projectId: definition.projectId,
      metrics: definition.metrics,
      filters: definition.filters ?? null,
      format: definition.format,
    },
    generatedAt: new Date().toISOString(),
    projectCount: projectIds.length,
    sections,
  };

  if (definition.format === "MARKDOWN") {
    return { ...payload, markdown: formatCustomReportMarkdown(payload) };
  }
  return payload;
}

export async function listReportDefinitions() {
  const rows = await prisma.customReportDefinition.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      project: { select: { id: true, name: true, slug: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      _count: { select: { schedules: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    scope: row.scope,
    projectId: row.projectId,
    project: row.project,
    metrics: row.metrics,
    filters: row.filters,
    format: row.format,
    scheduleCount: row._count.schedules,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export async function getReportDefinition(id) {
  const row = await prisma.customReportDefinition.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true, slug: true } },
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!row) throw new HttpError(404, "Report definition not found");
  return row;
}

export async function createReportDefinition(userId, input) {
  if (input.scope === "PROJECT") {
    const project = await prisma.project.findUnique({ where: { id: input.projectId } });
    if (!project) throw new HttpError(404, "Project not found");
  }

  return prisma.customReportDefinition.create({
    data: {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      scope: input.scope,
      projectId: input.scope === "PROJECT" ? input.projectId : null,
      metrics: input.metrics,
      filters: input.filters ?? null,
      format: input.format,
      createdById: userId,
    },
  });
}

export async function updateReportDefinition(id, input) {
  await getReportDefinition(id);
  if (input.scope === "PROJECT" && input.projectId) {
    const project = await prisma.project.findUnique({ where: { id: input.projectId } });
    if (!project) throw new HttpError(404, "Project not found");
  }

  return prisma.customReportDefinition.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.scope !== undefined ? { scope: input.scope } : {}),
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      ...(input.metrics !== undefined ? { metrics: input.metrics } : {}),
      ...(input.filters !== undefined ? { filters: input.filters } : {}),
      ...(input.format !== undefined ? { format: input.format } : {}),
    },
  });
}

export async function deleteReportDefinition(id) {
  await getReportDefinition(id);
  await prisma.customReportDefinition.delete({ where: { id } });
}

export { normalizeEmails };
