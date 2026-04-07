import { Router } from "express";
import { ProjectMemberRole } from "@prisma/client";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import {
  loadProjectMember,
  requireProjectRole,
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
} from "./apiDocs.schemas.js";
import * as apiDocsController from "./apiDocs.controller.js";

const r = Router({ mergeParams: true });

r.use(requireAuth);
r.use(loadProjectMember);

const viewer = requireProjectRole(ProjectMemberRole.VIEWER);
const editor = requireProjectRole(ProjectMemberRole.EDITOR);

r.get("/test-settings", viewer, apiDocsController.getTestSettings);
r.put("/test-settings", viewer, apiDocsController.saveTestSettings);

r.get("/groups", viewer, apiDocsController.listGroups);
r.post("/groups", editor, validate(createGroupSchema), apiDocsController.createGroup);
r.put("/groups/:groupId", editor, validate(updateGroupSchema), apiDocsController.updateGroup);
r.delete("/groups/:groupId", editor, apiDocsController.deleteGroup);

r.post(
  "/groups/:groupId/routes",
  editor,
  validate(createRouteSchema),
  apiDocsController.createRoute,
);
r.put("/routes/:routeId", editor, validate(updateRouteSchema), apiDocsController.updateRoute);
r.delete("/routes/:routeId", editor, apiDocsController.deleteRoute);

r.post(
  "/routes/:routeId/parameters",
  editor,
  validate(createParameterSchema),
  apiDocsController.createParameter,
);
r.put(
  "/routes/:routeId/parameters/:paramId",
  editor,
  validate(updateParameterSchema),
  apiDocsController.updateParameter,
);
r.delete(
  "/routes/:routeId/parameters/:paramId",
  editor,
  apiDocsController.deleteParameter,
);

r.post(
  "/routes/:routeId/responses",
  editor,
  validate(createResponseSchema),
  apiDocsController.createResponse,
);
r.put(
  "/routes/:routeId/responses/:responseId",
  editor,
  validate(updateResponseSchema),
  apiDocsController.updateResponse,
);
r.delete(
  "/routes/:routeId/responses/:responseId",
  editor,
  apiDocsController.deleteResponse,
);

export default r;
