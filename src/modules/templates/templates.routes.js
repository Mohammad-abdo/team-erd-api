import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as templatesService from "./templates.service.js";

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

r.post("/:templateId/projects", validate(createFromTemplateSchema), asyncHandler(async (req, res) => {
  const project = await templatesService.createProjectFromTemplate(
    req.user.sub,
    req.params.templateId,
    req.body,
  );
  res.status(201).json({ project });
}));

export default r;
