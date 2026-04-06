import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { emitToProject } from "../../sockets/emit.js";
import { logActivity } from "../activity/activity.service.js";

async function assertGroupInProject(projectId, groupId) {
  const g = await prisma.apiGroup.findFirst({
    where: { id: groupId, projectId },
  });
  if (!g) {
    throw new HttpError(404, "API group not found");
  }
  return g;
}

async function assertRouteInProject(projectId, routeId) {
  const route = await prisma.apiRoute.findFirst({
    where: { id: routeId, group: { projectId } },
    include: { group: true },
  });
  if (!route) {
    throw new HttpError(404, "API route not found");
  }
  return route;
}

async function assertParameterOnRoute(projectId, routeId, paramId) {
  const p = await prisma.apiParameter.findFirst({
    where: { id: paramId, routeId, route: { group: { projectId } } },
  });
  if (!p) {
    throw new HttpError(404, "Parameter not found");
  }
  return p;
}

async function assertResponseOnRoute(projectId, routeId, responseId) {
  const r = await prisma.apiRouteResponse.findFirst({
    where: { id: responseId, routeId, route: { group: { projectId } } },
  });
  if (!r) {
    throw new HttpError(404, "Response not found");
  }
  return r;
}

export async function listGroups(projectId) {
  return prisma.apiGroup.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" },
    include: {
      routes: {
        orderBy: { path: "asc" },
        include: {
          parameters: true,
          responses: true,
        },
      },
    },
  });
}

export async function createGroup(projectId, userId, input) {
  const group = await prisma.apiGroup.create({
    data: {
      projectId,
      name: input.name.trim(),
      prefix: input.prefix?.trim() ?? "",
      description: input.description?.trim() ?? null,
      sortOrder: input.sortOrder ?? 0,
    },
    include: { routes: true },
  });

  await logActivity({
    projectId,
    userId,
    action: "created",
    entityType: "api_group",
    entityId: group.id,
    newValues: { name: group.name },
  });

  emitToProject(projectId, "api:updated", { at: Date.now() });

  return group;
}

export async function updateGroup(projectId, userId, groupId, input) {
  await assertGroupInProject(projectId, groupId);
  const group = await prisma.apiGroup.update({
    where: { id: groupId },
    data: {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.prefix !== undefined && { prefix: input.prefix?.trim() ?? "" }),
      ...(input.description !== undefined && { description: input.description?.trim() ?? null }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
    },
    include: { routes: { include: { parameters: true, responses: true } } },
  });

  await logActivity({
    projectId,
    userId,
    action: "updated",
    entityType: "api_group",
    entityId: groupId,
    newValues: input,
  });

  emitToProject(projectId, "api:updated", { at: Date.now() });

  return group;
}

export async function deleteGroup(projectId, userId, groupId) {
  await assertGroupInProject(projectId, groupId);
  await prisma.apiGroup.delete({ where: { id: groupId } });

  await logActivity({
    projectId,
    userId,
    action: "deleted",
    entityType: "api_group",
    entityId: groupId,
  });

  emitToProject(projectId, "api:updated", { at: Date.now() });
}

export async function createRoute(projectId, userId, groupId, input) {
  await assertGroupInProject(projectId, groupId);
  const route = await prisma.apiRoute.create({
    data: {
      groupId,
      method: input.method,
      path: input.path.trim(),
      summary: input.summary?.trim() ?? null,
      description: input.description?.trim() ?? null,
      authRequired: input.authRequired ?? false,
      roleRequired: input.roleRequired === undefined ? null : input.roleRequired,
      createdById: userId,
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
    include: { parameters: true, responses: true },
  });

  await logActivity({
    projectId,
    userId,
    action: "created",
    entityType: "api_route",
    entityId: route.id,
    newValues: { method: route.method, path: route.path },
  });

  emitToProject(projectId, "api:updated", { at: Date.now() });

  return route;
}

export async function updateRoute(projectId, userId, routeId, input) {
  await assertRouteInProject(projectId, routeId);
  const route = await prisma.apiRoute.update({
    where: { id: routeId },
    data: {
      ...(input.method !== undefined && { method: input.method }),
      ...(input.path !== undefined && { path: input.path.trim() }),
      ...(input.summary !== undefined && { summary: input.summary?.trim() ?? null }),
      ...(input.description !== undefined && { description: input.description?.trim() ?? null }),
      ...(input.authRequired !== undefined && { authRequired: input.authRequired }),
      ...(input.roleRequired !== undefined && { roleRequired: input.roleRequired }),
      ...(input.status !== undefined && { status: input.status }),
    },
    include: { parameters: true, responses: true },
  });

  await logActivity({
    projectId,
    userId,
    action: "updated",
    entityType: "api_route",
    entityId: routeId,
    newValues: input,
  });

  emitToProject(projectId, "api:updated", { at: Date.now() });

  return route;
}

export async function deleteRoute(projectId, userId, routeId) {
  await assertRouteInProject(projectId, routeId);
  await prisma.apiRoute.delete({ where: { id: routeId } });

  await logActivity({
    projectId,
    userId,
    action: "deleted",
    entityType: "api_route",
    entityId: routeId,
  });

  emitToProject(projectId, "api:updated", { at: Date.now() });
}

export async function createParameter(projectId, userId, routeId, input) {
  await assertRouteInProject(projectId, routeId);
  const param = await prisma.apiParameter.create({
    data: {
      routeId,
      location: input.location,
      name: input.name.trim(),
      dataType: input.dataType.trim(),
      isRequired: input.isRequired ?? false,
      description: input.description?.trim() ?? null,
      example: input.example?.trim() ?? null,
    },
  });

  await logActivity({
    projectId,
    userId,
    action: "created",
    entityType: "api_parameter",
    entityId: param.id,
    newValues: { name: param.name, routeId },
  });

  emitToProject(projectId, "api:updated", { at: Date.now() });

  return param;
}

export async function updateParameter(projectId, userId, routeId, paramId, input) {
  await assertParameterOnRoute(projectId, routeId, paramId);
  const param = await prisma.apiParameter.update({
    where: { id: paramId },
    data: {
      ...(input.location !== undefined && { location: input.location }),
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.dataType !== undefined && { dataType: input.dataType.trim() }),
      ...(input.isRequired !== undefined && { isRequired: input.isRequired }),
      ...(input.description !== undefined && { description: input.description?.trim() ?? null }),
      ...(input.example !== undefined && { example: input.example?.trim() ?? null }),
    },
  });

  await logActivity({
    projectId,
    userId,
    action: "updated",
    entityType: "api_parameter",
    entityId: paramId,
    newValues: input,
  });

  emitToProject(projectId, "api:updated", { at: Date.now() });

  return param;
}

export async function deleteParameter(projectId, userId, routeId, paramId) {
  await assertParameterOnRoute(projectId, routeId, paramId);
  await prisma.apiParameter.delete({ where: { id: paramId } });

  await logActivity({
    projectId,
    userId,
    action: "deleted",
    entityType: "api_parameter",
    entityId: paramId,
  });

  emitToProject(projectId, "api:updated", { at: Date.now() });
}

export async function createResponse(projectId, userId, routeId, input) {
  await assertRouteInProject(projectId, routeId);
  const row = await prisma.apiRouteResponse.create({
    data: {
      routeId,
      statusCode: input.statusCode,
      description: input.description?.trim() ?? null,
      exampleJson: input.exampleJson === undefined ? null : input.exampleJson,
    },
  });

  await logActivity({
    projectId,
    userId,
    action: "created",
    entityType: "api_response",
    entityId: row.id,
    newValues: { statusCode: row.statusCode, routeId },
  });

  emitToProject(projectId, "api:updated", { at: Date.now() });

  return row;
}

export async function updateResponse(projectId, userId, routeId, responseId, input) {
  await assertResponseOnRoute(projectId, routeId, responseId);
  const row = await prisma.apiRouteResponse.update({
    where: { id: responseId },
    data: {
      ...(input.statusCode !== undefined && { statusCode: input.statusCode }),
      ...(input.description !== undefined && { description: input.description?.trim() ?? null }),
      ...(input.exampleJson !== undefined && { exampleJson: input.exampleJson }),
    },
  });

  await logActivity({
    projectId,
    userId,
    action: "updated",
    entityType: "api_response",
    entityId: responseId,
    newValues: input,
  });

  emitToProject(projectId, "api:updated", { at: Date.now() });

  return row;
}

export async function deleteResponse(projectId, userId, routeId, responseId) {
  await assertResponseOnRoute(projectId, routeId, responseId);
  await prisma.apiRouteResponse.delete({ where: { id: responseId } });

  await logActivity({
    projectId,
    userId,
    action: "deleted",
    entityType: "api_response",
    entityId: responseId,
  });

  emitToProject(projectId, "api:updated", { at: Date.now() });
}
