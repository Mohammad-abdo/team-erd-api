import { Router } from "express";
import { ProjectMemberRole } from "@prisma/client";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import {
  loadProjectMember,
  requireProjectRole,
} from "../../middleware/projectAccess.js";
import { generateSchemaSchema } from "./ai.schemas.js";
import * as aiController from "./ai.controller.js";

const r = Router({ mergeParams: true });

r.use(requireAuth);
r.use(loadProjectMember);

const editor = requireProjectRole(ProjectMemberRole.EDITOR);

r.post("/preview", editor, validate(generateSchemaSchema), aiController.previewSchema);
r.post("/apply", editor, validate(generateSchemaSchema), aiController.applySchema);

export default r;
