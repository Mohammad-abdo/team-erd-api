import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import {
  loadProjectMember,
  requireProjectPermission,
  PermissionResource,
  PermissionAction,
} from "../../middleware/projectAccess.js";
import * as exportController from "./export.controller.js";

const r = Router({ mergeParams: true });

r.use(requireAuth);
r.use(loadProjectMember);
r.use(requireProjectPermission(PermissionResource.EXPORTS, PermissionAction.VIEW));

r.get("/sql", exportController.sql);
r.get("/json", exportController.json);
r.get("/markdown", exportController.markdown);
r.get("/prisma", exportController.prismaSchema);
r.get("/typeorm", exportController.typeorm);
r.get("/swagger", exportController.swagger);
r.get("/postman", exportController.postman);

export default r;
