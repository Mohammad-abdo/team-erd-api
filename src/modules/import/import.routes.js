import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import {
  loadProjectMember,
  requireProjectPermission,
  PermissionResource,
  PermissionAction,
} from "../../middleware/projectAccess.js";
import {
  mysqlIntrospectSchema,
  postgresIntrospectSchema,
  mysqlDriftSchema,
  postgresDriftSchema,
} from "./introspect.schemas.js";
import { dbProfileCreateSchema, dbProfileUpdateSchema } from "./dbProfiles.schemas.js";
import { driftScheduleUpsertSchema } from "./driftSchedule.schemas.js";
import * as importController from "./import.controller.js";
import { validate } from "../../middleware/validate.js";
import { blockClientUsers, requireDriftReadAccess } from "../../middleware/clientPortal.js";
import { expensiveDbLimiter } from "../../middleware/rateLimits.js";

const r = Router({ mergeParams: true });

r.use(requireAuth);
r.use(loadProjectMember);

const erdView = requireProjectPermission(PermissionResource.ERD, PermissionAction.VIEW);
const erdEdit = requireProjectPermission(PermissionResource.ERD, PermissionAction.EDIT);
const apiEdit = requireProjectPermission(PermissionResource.API, PermissionAction.EDIT);

r.post("/erd", erdEdit, importController.importErdSchema);
r.post("/api", apiEdit, importController.importApiDocs);
r.post("/swagger", apiEdit, importController.importSwagger);
r.post("/postman", apiEdit, importController.importPostman);
r.post(
  "/introspect/mysql/preview",
  expensiveDbLimiter,
  blockClientUsers,
  erdView,
  validate(mysqlIntrospectSchema),
  importController.previewMysqlIntrospect,
);
r.post(
  "/introspect/mysql",
  expensiveDbLimiter,
  erdEdit,
  validate(mysqlIntrospectSchema),
  importController.importMysqlIntrospect,
);
r.post(
  "/introspect/postgres/preview",
  expensiveDbLimiter,
  blockClientUsers,
  erdView,
  validate(postgresIntrospectSchema),
  importController.previewPostgresIntrospect,
);
r.post(
  "/introspect/postgres",
  expensiveDbLimiter,
  erdEdit,
  validate(postgresIntrospectSchema),
  importController.importPostgresIntrospect,
);
r.get("/drift/latest", requireDriftReadAccess, importController.getLatestDrift);
r.get("/drift/migration-package", requireDriftReadAccess, importController.getDriftMigrationPackage);
r.get("/drift/history", requireDriftReadAccess, importController.listDriftHistory);
r.post(
  "/drift/mysql",
  expensiveDbLimiter,
  blockClientUsers,
  erdView,
  validate(mysqlDriftSchema),
  importController.checkMysqlDrift,
);
r.post(
  "/drift/postgres",
  expensiveDbLimiter,
  blockClientUsers,
  erdView,
  validate(postgresDriftSchema),
  importController.checkPostgresDrift,
);
r.get("/db-profiles", blockClientUsers, erdView, importController.listDbProfiles);
r.post(
  "/db-profiles",
  blockClientUsers,
  erdEdit,
  validate(dbProfileCreateSchema),
  importController.createDbProfile,
);
r.put(
  "/db-profiles/:profileId",
  blockClientUsers,
  erdEdit,
  validate(dbProfileUpdateSchema),
  importController.updateDbProfile,
);
r.delete("/db-profiles/:profileId", blockClientUsers, erdEdit, importController.deleteDbProfile);
r.get("/drift/schedule", blockClientUsers, erdView, importController.getDriftSchedule);
r.put(
  "/drift/schedule",
  blockClientUsers,
  erdEdit,
  validate(driftScheduleUpsertSchema),
  importController.upsertDriftSchedule,
);
r.delete("/drift/schedule", blockClientUsers, erdEdit, importController.deleteDriftSchedule);

export default r;
