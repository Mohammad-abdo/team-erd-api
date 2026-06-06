import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import {
  loadProjectMember,
  requireProjectPermission,
  PermissionResource,
  PermissionAction,
} from "../../middleware/projectAccess.js";
import { aiLimiter } from "../../middleware/rateLimits.js";
import { generateSchemaSchema, explainDriftSchema, applyApiRoutesSchema } from "./ai.schemas.js";
import * as aiController from "./ai.controller.js";

const r = Router({ mergeParams: true });

r.use(requireAuth);
r.use(loadProjectMember);
r.use(aiLimiter);

const erdView = requireProjectPermission(PermissionResource.ERD, PermissionAction.VIEW);
const erdEdit = requireProjectPermission(PermissionResource.ERD, PermissionAction.EDIT);
const apiView = requireProjectPermission(PermissionResource.API, PermissionAction.VIEW);
const apiEdit = requireProjectPermission(PermissionResource.API, PermissionAction.EDIT);

r.post("/preview", erdView, validate(generateSchemaSchema), aiController.previewSchema);
r.post("/apply", erdEdit, validate(generateSchemaSchema), aiController.applySchema);
r.post("/explain-drift", erdView, validate(explainDriftSchema), aiController.explainDrift);
r.post("/suggest-api-routes", apiView, aiController.suggestApiRoutes);
r.post("/apply-api-routes", apiEdit, validate(applyApiRoutesSchema), aiController.applyApiRoutes);

export default r;
