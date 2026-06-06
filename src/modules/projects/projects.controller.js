import { asyncHandler } from "../../utils/asyncHandler.js";
import { serializeClientAccess } from "../../lib/clientPortal.js";
import { computeProjectHealthStage } from "./projectHealthStage.js";
import * as projectsService from "./projects.service.js";

function serializeProject(project) {
  const { members, _count, activityLogs, apiGroups, clientAccess, ...rest } = project;
  const apiRouteTotal = (apiGroups ?? []).reduce((acc, g) => acc + (g._count?.routes ?? 0), 0);
  const lastAt = activityLogs?.[0]?.createdAt ?? project.createdAt;
  const tableCount = _count?.erdTables ?? 0;
  const relationCount = _count?.erdRelations ?? 0;
  const commentCount = _count?.comments ?? 0;

  const healthStage = computeProjectHealthStage({
    lastActivityAt: lastAt,
    createdAt: project.createdAt,
    tableCount,
    relationCount,
    routeCount: apiRouteTotal,
    commentCount,
  });

  return {
    ...rest,
    myRole: members[0]?.role ?? null,
    memberCount: _count?.members ?? 0,
    counts: {
      tables: tableCount,
      relations: relationCount,
      comments: commentCount,
      apiRoutes: apiRouteTotal,
    },
    lastActivityAt: lastAt instanceof Date ? lastAt.toISOString() : lastAt,
    healthStage,
    clientAccess: clientAccess?.[0] ? serializeClientAccess(clientAccess[0]) : null,
  };
}

function serializeTeams(project) {
  return (project.teamProjects ?? []).map((tp) => tp.team);
}

export const list = asyncHandler(async (req, res) => {
  const teamId = req.query.teamId ? String(req.query.teamId) : undefined;
  const rows = await projectsService.listProjectsForUser(req.user.sub, { teamId });
  res.json({
    projects: rows.map((p) => ({ ...serializeProject(p), teams: serializeTeams(p) })),
  });
});

export const create = asyncHandler(async (req, res) => {
  const project = await projectsService.createProject(req.user.sub, req.body);
  res.status(201).json({ project: serializeProject(project) });
});

export const getOne = asyncHandler(async (req, res) => {
  const project = await projectsService.getProjectByIdForUser(req.params.id, req.user.sub);
  res.json({ project: { ...serializeProject(project), teams: serializeTeams(project) } });
});

export const update = asyncHandler(async (req, res) => {
  const project = await projectsService.updateProject(req.params.id, req.user.sub, req.body);
  res.json({ project: serializeProject(project) });
});

export const remove = asyncHandler(async (req, res) => {
  await projectsService.deleteProject(req.params.id, req.user.sub);
  res.status(204).end();
});
