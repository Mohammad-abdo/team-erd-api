import { Router } from "express";
import { ProjectMemberRole } from "@prisma/client";
import { requireAuth } from "../../middleware/auth.js";
import {
  loadProjectMember,
  requireProjectRole,
} from "../../middleware/projectAccess.js";
import * as exportController from "./export.controller.js";

const r = Router({ mergeParams: true });

r.use(requireAuth);
r.use(loadProjectMember);
r.use(requireProjectRole(ProjectMemberRole.VIEWER));

r.get("/sql", exportController.sql);
r.get("/json", exportController.json);
r.get("/markdown", exportController.markdown);
r.get("/swagger", exportController.swagger);
r.get("/postman", exportController.postman);

export default r;
