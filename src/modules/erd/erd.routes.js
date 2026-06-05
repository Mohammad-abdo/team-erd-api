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
  createTableSchema,
  updateTableSchema,
  createColumnSchema,
  updateColumnSchema,
  createRelationSchema,
  updateRelationSchema,
} from "./erd.schemas.js";
import * as erdController from "./erd.controller.js";

const r = Router({ mergeParams: true });

r.use(requireAuth);
r.use(loadProjectMember);

const erdView = requireProjectPermission(PermissionResource.ERD, PermissionAction.VIEW);
const erdCreate = requireProjectPermission(PermissionResource.ERD, PermissionAction.CREATE);
const erdEdit = requireProjectPermission(PermissionResource.ERD, PermissionAction.EDIT);
const erdDelete = requireProjectPermission(PermissionResource.ERD, PermissionAction.DELETE);

r.get("/tables", erdView, erdController.listTables);
r.post("/tables", erdCreate, validate(createTableSchema), erdController.createTable);
r.put("/tables/:tableId", erdEdit, validate(updateTableSchema), erdController.updateTable);
r.delete("/tables/:tableId", erdDelete, erdController.deleteTable);

r.post(
  "/tables/:tableId/columns",
  erdCreate,
  validate(createColumnSchema),
  erdController.createColumn,
);
r.put(
  "/tables/:tableId/columns/:columnId",
  erdEdit,
  validate(updateColumnSchema),
  erdController.updateColumn,
);
r.delete("/tables/:tableId/columns/:columnId", erdDelete, erdController.deleteColumn);

r.get("/relations", erdView, erdController.listRelations);
r.post("/relations", erdCreate, validate(createRelationSchema), erdController.createRelation);
r.put(
  "/relations/:relationId",
  erdEdit,
  validate(updateRelationSchema),
  erdController.updateRelation,
);
r.delete("/relations/:relationId", erdDelete, erdController.deleteRelation);

export default r;
