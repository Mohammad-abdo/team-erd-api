import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { requirePlatformAdmin } from "../../middleware/adminAccess.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as templatesService from "./templates.service.js";
import {
  createFromProjectSchema,
  createTemplateSchema,
  updateTemplateSchema,
} from "./templates.schemas.js";

const createFromTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  teamIds: z.array(z.string()).optional(),
});

const r = Router();

r.use(requireAuth);

r.get("/", asyncHandler(async (_req, res) => {
  const templates = await templatesService.listTemplates();
  res.json({ templates });
}));

r.post("/", requirePlatformAdmin, validate(createTemplateSchema), asyncHandler(async (req, res) => {
  const template = await templatesService.createTemplate(req.user.sub, req.body);
  res.status(201).json({ template });
}));

r.post("/from-project", requirePlatformAdmin, validate(createFromProjectSchema), asyncHandler(async (req, res) => {
  const template = await templatesService.createTemplateFromProject(req.user.sub, req.body.projectId, req.body);
  res.status(201).json({ template });
}));

r.get("/:templateId", asyncHandler(async (req, res) => {
  const template = await templatesService.getTemplate(req.params.templateId);
  res.json({ template });
}));

r.patch("/:templateId", requirePlatformAdmin, validate(updateTemplateSchema), asyncHandler(async (req, res) => {
  const template = await templatesService.updateTemplate(req.user.sub, req.params.templateId, req.body);
  res.json({ template });
}));

r.delete("/:templateId", requirePlatformAdmin, asyncHandler(async (req, res) => {
  await templatesService.deleteTemplate(req.user.sub, req.params.templateId);
  res.status(204).end();
}));

r.post("/:templateId/projects", validate(createFromTemplateSchema), asyncHandler(async (req, res) => {
  const project = await templatesService.createProjectFromTemplate(
    req.user.sub,
    req.params.templateId,
    req.body,
  );
  res.status(201).json({ project });
}));

export default r;
