import { asyncHandler } from "../../utils/asyncHandler.js";
import * as aiService from "./ai.service.js";
import { importErdSchema } from "../import/import.service.js";

export const previewSchema = asyncHandler(async (req, res) => {
  const result = await aiService.generateSchemaFromDescription(req.body.description);
  res.json({
    tables: result.tables,
    relations: result.relations,
    source: result.source,
  });
});

export const applySchema = asyncHandler(async (req, res) => {
  const generated = await aiService.generateSchemaFromDescription(req.body.description);
  const imported = await importErdSchema(req.params.projectId, req.user.sub, {
    tables: generated.tables,
    relations: generated.relations,
    clearExisting: req.body.clearExisting ?? false,
  });
  res.status(201).json({
    ...imported,
    source: generated.source,
    tableCount: generated.tables.length,
    relationCount: generated.relations.length,
  });
});
