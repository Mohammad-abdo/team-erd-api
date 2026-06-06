import { Router } from "express";
import { ProjectMemberRole } from "@prisma/client";
import { requireAuth } from "../../middleware/auth.js";
import {
  loadProjectMember,
  requireProjectRole,
} from "../../middleware/projectAccess.js";
import { mysqlIntrospectSchema } from "./introspect.schemas.js";
import * as importController from "./import.controller.js";
import { validate } from "../../middleware/validate.js";

const r = Router({ mergeParams: true });

r.use(requireAuth);
r.use(loadProjectMember);

const editor = requireProjectRole(ProjectMemberRole.EDITOR);

r.post("/erd", editor, importController.importErdSchema);
r.post("/api", editor, importController.importApiDocs);
r.post("/swagger", editor, importController.importSwagger);
r.post("/postman", editor, importController.importPostman);
r.post("/introspect/mysql/preview", editor, validate(mysqlIntrospectSchema), importController.previewMysqlIntrospect);
r.post("/introspect/mysql", editor, validate(mysqlIntrospectSchema), importController.importMysqlIntrospect);

export default r;
