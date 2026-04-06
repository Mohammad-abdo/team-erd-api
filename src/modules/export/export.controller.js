import { asyncHandler } from "../../utils/asyncHandler.js";
import * as exportService from "./export.service.js";

export const sql = asyncHandler(async (req, res) => {
  const ddl = await exportService.exportErdSql(req.params.projectId);
  res.type("text/plain").send(ddl);
});

export const json = asyncHandler(async (req, res) => {
  const doc = await exportService.exportErdJson(req.params.projectId);
  res.json(doc);
});

export const markdown = asyncHandler(async (req, res) => {
  const md = await exportService.exportMarkdown(req.params.projectId);
  res.type("text/markdown").send(md);
});

export const swagger = asyncHandler(async (req, res) => {
  const doc = await exportService.exportSwagger(req.params.projectId);
  res
    .setHeader("Content-Disposition", "attachment; filename=\"openapi.json\"")
    .json(doc);
});

export const postman = asyncHandler(async (req, res) => {
  const col = await exportService.exportPostman(req.params.projectId);
  res
    .setHeader("Content-Disposition", "attachment; filename=\"postman_collection.json\"")
    .json(col);
});
