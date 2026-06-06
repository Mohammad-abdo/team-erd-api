import { PermissionResource, PlatformRole } from "@prisma/client";
import { prisma } from "./prisma.js";

export const DEFAULT_CLIENT_ACCESS = {
  viewOverview: true,
  viewErd: true,
  viewApi: false,
  viewReport: true,
  viewTasks: true,
  viewComments: false,
  viewActivity: false,
  viewHealth: false,
};

export const CLIENT_ACCESS_FIELDS = [
  "viewOverview",
  "viewErd",
  "viewApi",
  "viewReport",
  "viewTasks",
  "viewComments",
  "viewActivity",
  "viewHealth",
];

const RESOURCE_VIEW_KEY = {
  [PermissionResource.ERD]: "erd",
  [PermissionResource.API]: "api",
  [PermissionResource.TASKS]: "tasks",
  [PermissionResource.COMMENTS]: "comments",
};

export function normalizeClientAccessInput(input = {}) {
  return {
    viewOverview: input.viewOverview ?? input.overview ?? DEFAULT_CLIENT_ACCESS.viewOverview,
    viewErd: input.viewErd ?? input.erd ?? DEFAULT_CLIENT_ACCESS.viewErd,
    viewApi: input.viewApi ?? input.api ?? DEFAULT_CLIENT_ACCESS.viewApi,
    viewReport: input.viewReport ?? input.report ?? DEFAULT_CLIENT_ACCESS.viewReport,
    viewTasks: input.viewTasks ?? input.tasks ?? DEFAULT_CLIENT_ACCESS.viewTasks,
    viewComments: input.viewComments ?? input.comments ?? DEFAULT_CLIENT_ACCESS.viewComments,
    viewActivity: input.viewActivity ?? input.activity ?? DEFAULT_CLIENT_ACCESS.viewActivity,
    viewHealth: input.viewHealth ?? input.health ?? DEFAULT_CLIENT_ACCESS.viewHealth,
  };
}

export function serializeClientAccess(row) {
  if (!row) return null;
  return {
    overview: row.viewOverview,
    erd: row.viewErd,
    api: row.viewApi,
    report: row.viewReport,
    tasks: row.viewTasks,
    comments: row.viewComments,
    activity: row.viewActivity,
    health: row.viewHealth,
  };
}

export function clientViewKeyForResource(resource) {
  return RESOURCE_VIEW_KEY[resource] ?? null;
}

export async function isPlatformClient(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { platformRole: true },
  });
  return user?.platformRole === PlatformRole.CLIENT;
}

export async function getClientAccessRecord(userId, projectId) {
  return prisma.clientProjectAccess.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
}

export async function upsertClientProjectAccess(userId, projectId, input) {
  const data = normalizeClientAccessInput(input);
  return prisma.clientProjectAccess.upsert({
    where: { projectId_userId: { projectId, userId } },
    create: { projectId, userId, ...data },
    update: data,
  });
}

export function sanitizeReportForClient(report) {
  return {
    ...report,
    project: {
      id: report.project.id,
      name: report.project.name,
      slug: report.project.slug,
      description: report.project.description,
      visibility: report.project.visibility,
      createdAt: report.project.createdAt,
      leader: report.project.leader
        ? { id: report.project.leader.id, name: report.project.leader.name }
        : null,
    },
    team: {
      memberCount: report.statistics?.members ?? report.team?.members?.length ?? 0,
    },
    recentActivity: [],
    statistics: {
      ...report.statistics,
      members: undefined,
    },
  };
}
