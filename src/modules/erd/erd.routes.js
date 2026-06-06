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
  createIndexSchema,
  createCheckConstraintSchema,
} from "./erd.schemas.js";
import * as erdController from "./erd.controller.js";
import * as snapshotsController from "./erdSnapshots.controller.js";
import { createSnapshotSchema, diffSnapshotsQuerySchema } from "./erdSnapshots.schemas.js";

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

r.post(
  "/tables/:tableId/indexes",
  erdCreate,
  validate(createIndexSchema),
  erdController.createTableIndex,
);
r.delete("/tables/:tableId/indexes/:indexId", erdDelete, erdController.deleteTableIndex);

r.post(
  "/tables/:tableId/check-constraints",
  erdCreate,
  validate(createCheckConstraintSchema),
  erdController.createCheckConstraint,
);
r.delete(
  "/tables/:tableId/check-constraints/:constraintId",
  erdDelete,
  erdController.deleteCheckConstraint,
);

r.get("/validation", erdView, erdController.getValidation);
r.get("/relations", erdView, erdController.listRelations);
r.post("/relations", erdCreate, validate(createRelationSchema), erdController.createRelation);
r.put(
  "/relations/:relationId",
  erdEdit,
  validate(updateRelationSchema),
  erdController.updateRelation,
);
r.delete("/relations/:relationId", erdDelete, erdController.deleteRelation);

r.get("/snapshots", erdView, snapshotsController.list);
r.get(
  "/snapshots/diff",
  erdView,
  validate(diffSnapshotsQuerySchema, "query"),
  snapshotsController.diff,
);
r.post("/snapshots", erdEdit, validate(createSnapshotSchema), snapshotsController.create);
r.get("/snapshots/:snapshotId", erdView, snapshotsController.getOne);
r.post("/snapshots/:snapshotId/restore", erdEdit, snapshotsController.restore);
r.delete("/snapshots/:snapshotId", erdDelete, snapshotsController.remove);

export default r;
