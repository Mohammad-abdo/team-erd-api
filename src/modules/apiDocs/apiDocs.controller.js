import { asyncHandler } from "../../utils/asyncHandler.js";
import * as apiDocsService from "./apiDocs.service.js";

export const listGroups = asyncHandler(async (req, res) => {
  const groups = await apiDocsService.listGroups(req.params.projectId);
  res.json({ groups });
});

export const createGroup = asyncHandler(async (req, res) => {
  const group = await apiDocsService.createGroup(req.params.projectId, req.user.sub, req.body);
  res.status(201).json({ group });
});

export const updateGroup = asyncHandler(async (req, res) => {
  const group = await apiDocsService.updateGroup(
    req.params.projectId,
    req.user.sub,
    req.params.groupId,
    req.body,
  );
  res.json({ group });
});

export const deleteGroup = asyncHandler(async (req, res) => {
  await apiDocsService.deleteGroup(req.params.projectId, req.user.sub, req.params.groupId);
  res.status(204).end();
});

export const createRoute = asyncHandler(async (req, res) => {
  const route = await apiDocsService.createRoute(
    req.params.projectId,
    req.user.sub,
    req.params.groupId,
    req.body,
  );
  res.status(201).json({ route });
});

export const updateRoute = asyncHandler(async (req, res) => {
  const route = await apiDocsService.updateRoute(
    req.params.projectId,
    req.user.sub,
    req.params.routeId,
    req.body,
  );
  res.json({ route });
});

export const deleteRoute = asyncHandler(async (req, res) => {
  await apiDocsService.deleteRoute(req.params.projectId, req.user.sub, req.params.routeId);
  res.status(204).end();
});

export const createParameter = asyncHandler(async (req, res) => {
  const parameter = await apiDocsService.createParameter(
    req.params.projectId,
    req.user.sub,
    req.params.routeId,
    req.body,
  );
  res.status(201).json({ parameter });
});

export const updateParameter = asyncHandler(async (req, res) => {
  const parameter = await apiDocsService.updateParameter(
    req.params.projectId,
    req.user.sub,
    req.params.routeId,
    req.params.paramId,
    req.body,
  );
  res.json({ parameter });
});

export const deleteParameter = asyncHandler(async (req, res) => {
  await apiDocsService.deleteParameter(
    req.params.projectId,
    req.user.sub,
    req.params.routeId,
    req.params.paramId,
  );
  res.status(204).end();
});

export const createResponse = asyncHandler(async (req, res) => {
  const response = await apiDocsService.createResponse(
    req.params.projectId,
    req.user.sub,
    req.params.routeId,
    req.body,
  );
  res.status(201).json({ response });
});

export const updateResponse = asyncHandler(async (req, res) => {
  const response = await apiDocsService.updateResponse(
    req.params.projectId,
    req.user.sub,
    req.params.routeId,
    req.params.responseId,
    req.body,
  );
  res.json({ response });
});

export const deleteResponse = asyncHandler(async (req, res) => {
  await apiDocsService.deleteResponse(
    req.params.projectId,
    req.user.sub,
    req.params.routeId,
    req.params.responseId,
  );
  res.status(204).end();
});
