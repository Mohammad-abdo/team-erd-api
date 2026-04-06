import { asyncHandler } from "../../utils/asyncHandler.js";
import * as erdService from "./erd.service.js";

export const listTables = asyncHandler(async (req, res) => {
  const tables = await erdService.listTables(req.params.projectId);
  res.json({ tables });
});

export const createTable = asyncHandler(async (req, res) => {
  const table = await erdService.createTable(req.params.projectId, req.user.sub, req.body);
  res.status(201).json({ table });
});

export const updateTable = asyncHandler(async (req, res) => {
  const table = await erdService.updateTable(
    req.params.projectId,
    req.user.sub,
    req.params.tableId,
    req.body,
  );
  res.json({ table });
});

export const deleteTable = asyncHandler(async (req, res) => {
  await erdService.deleteTable(req.params.projectId, req.user.sub, req.params.tableId);
  res.status(204).end();
});

export const createColumn = asyncHandler(async (req, res) => {
  const column = await erdService.createColumn(
    req.params.projectId,
    req.user.sub,
    req.params.tableId,
    req.body,
  );
  res.status(201).json({ column });
});

export const updateColumn = asyncHandler(async (req, res) => {
  const column = await erdService.updateColumn(
    req.params.projectId,
    req.user.sub,
    req.params.tableId,
    req.params.columnId,
    req.body,
  );
  res.json({ column });
});

export const deleteColumn = asyncHandler(async (req, res) => {
  await erdService.deleteColumn(
    req.params.projectId,
    req.user.sub,
    req.params.tableId,
    req.params.columnId,
  );
  res.status(204).end();
});

export const listRelations = asyncHandler(async (req, res) => {
  const relations = await erdService.listRelations(req.params.projectId);
  res.json({ relations });
});

export const createRelation = asyncHandler(async (req, res) => {
  const relation = await erdService.createRelation(req.params.projectId, req.user.sub, req.body);
  res.status(201).json({ relation });
});

export const updateRelation = asyncHandler(async (req, res) => {
  const relation = await erdService.updateRelation(
    req.params.projectId,
    req.user.sub,
    req.params.relationId,
    req.body,
  );
  res.json({ relation });
});

export const deleteRelation = asyncHandler(async (req, res) => {
  await erdService.deleteRelation(req.params.projectId, req.user.sub, req.params.relationId);
  res.status(204).end();
});
