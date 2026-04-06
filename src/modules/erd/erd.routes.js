import { Router } from "express";
import { ProjectMemberRole } from "@prisma/client";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import {
  loadProjectMember,
  requireProjectRole,
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

const viewer = requireProjectRole(ProjectMemberRole.VIEWER);
const editor = requireProjectRole(ProjectMemberRole.EDITOR);

r.get("/tables", viewer, erdController.listTables);
r.post("/tables", editor, validate(createTableSchema), erdController.createTable);
r.put("/tables/:tableId", editor, validate(updateTableSchema), erdController.updateTable);
r.delete("/tables/:tableId", editor, erdController.deleteTable);

r.post(
  "/tables/:tableId/columns",
  editor,
  validate(createColumnSchema),
  erdController.createColumn,
);
r.put(
  "/tables/:tableId/columns/:columnId",
  editor,
  validate(updateColumnSchema),
  erdController.updateColumn,
);
r.delete("/tables/:tableId/columns/:columnId", editor, erdController.deleteColumn);

r.get("/relations", viewer, erdController.listRelations);
r.post("/relations", editor, validate(createRelationSchema), erdController.createRelation);
r.put(
  "/relations/:relationId",
  editor,
  validate(updateRelationSchema),
  erdController.updateRelation,
);
r.delete("/relations/:relationId", editor, erdController.deleteRelation);

export default r;
