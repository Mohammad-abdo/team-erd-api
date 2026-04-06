import { asyncHandler } from "../../utils/asyncHandler.js";
import * as importService from "./import.service.js";

export const importErdSchema = asyncHandler(async (req, res) => {
  const result = await importService.importErdSchema(
    req.params.projectId,
    req.user.sub,
    req.body,
  );
  res.status(201).json(result);
});

export const importApiDocs = asyncHandler(async (req, res) => {
  const result = await importService.importApiDocs(
    req.params.projectId,
    req.user.sub,
    req.body,
  );
  res.status(201).json(result);
});

export const importSwagger = asyncHandler(async (req, res) => {
  const result = await importService.importSwagger(
    req.params.projectId,
    req.user.sub,
    req.body,
  );
  res.status(201).json(result);
});

export const importPostman = asyncHandler(async (req, res) => {
  const result = await importService.importPostman(
    req.params.projectId,
    req.user.sub,
    req.body,
  );
  res.status(201).json(result);
});
