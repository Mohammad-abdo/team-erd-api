import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import {
  loadProjectMember,
  requireProjectPermission,
  PermissionResource,
  PermissionAction,
} from "../../middleware/projectAccess.js";
import {
  createGroupSchema,
  updateGroupSchema,
  createRouteSchema,
  updateRouteSchema,
  createParameterSchema,
  updateParameterSchema,
  createResponseSchema,
  updateResponseSchema,
  saveTestSettingsSchema,
  setRouteErdLinksSchema,
} from "./apiDocs.schemas.js";
import * as apiDocsController from "./apiDocs.controller.js";

const r = Router({ mergeParams: true });

r.use(requireAuth);
r.use(loadProjectMember);

const apiView = requireProjectPermission(PermissionResource.API, PermissionAction.VIEW);
const apiCreate = requireProjectPermission(PermissionResource.API, PermissionAction.CREATE);
const apiEdit = requireProjectPermission(PermissionResource.API, PermissionAction.EDIT);
const apiDelete = requireProjectPermission(PermissionResource.API, PermissionAction.DELETE);

r.get("/test-settings", apiView, apiDocsController.getTestSettings);
r.put("/test-settings", apiView, validate(saveTestSettingsSchema), apiDocsController.saveTestSettings);

r.get("/erd-sync-hints", apiView, apiDocsController.getErdSyncHints);
r.get("/erd-links", apiView, apiDocsController.listErdLinks);
r.get("/groups", apiView, apiDocsController.listGroups);
r.post("/groups", apiCreate, validate(createGroupSchema), apiDocsController.createGroup);
r.put("/groups/:groupId", apiEdit, validate(updateGroupSchema), apiDocsController.updateGroup);
r.delete("/groups/:groupId", apiDelete, apiDocsController.deleteGroup);

r.post(
  "/groups/:groupId/routes",
  apiCreate,
  validate(createRouteSchema),
  apiDocsController.createRoute,
);
r.put("/routes/:routeId", apiEdit, validate(updateRouteSchema), apiDocsController.updateRoute);
r.put(
  "/routes/:routeId/erd-links",
  apiEdit,
  validate(setRouteErdLinksSchema),
  apiDocsController.setRouteErdLinks,
);
r.delete("/routes/:routeId", apiDelete, apiDocsController.deleteRoute);

r.post(
  "/routes/:routeId/parameters",
  apiCreate,
  validate(createParameterSchema),
  apiDocsController.createParameter,
);
r.put(
  "/routes/:routeId/parameters/:paramId",
  apiEdit,
  validate(updateParameterSchema),
  apiDocsController.updateParameter,
);
r.delete(
  "/routes/:routeId/parameters/:paramId",
  apiDelete,
  apiDocsController.deleteParameter,
);

r.post(
  "/routes/:routeId/responses",
  apiCreate,
  validate(createResponseSchema),
  apiDocsController.createResponse,
);
r.put(
  "/routes/:routeId/responses/:responseId",
  apiEdit,
  validate(updateResponseSchema),
  apiDocsController.updateResponse,
);
r.delete(
  "/routes/:routeId/responses/:responseId",
  apiDelete,
  apiDocsController.deleteResponse,
);

export default r;
