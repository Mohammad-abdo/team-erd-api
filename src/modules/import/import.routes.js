import { Router } from "express";
import { ProjectMemberRole } from "@prisma/client";
import { requireAuth } from "../../middleware/auth.js";
import {
  loadProjectMember,
  requireProjectRole,
} from "../../middleware/projectAccess.js";
import * as importController from "./import.controller.js";

const r = Router({ mergeParams: true });

r.use(requireAuth);
r.use(loadProjectMember);

const editor = requireProjectRole(ProjectMemberRole.EDITOR);

r.post("/erd", editor, importController.importErdSchema);
r.post("/api", editor, importController.importApiDocs);
r.post("/swagger", editor, importController.importSwagger);
r.post("/postman", editor, importController.importPostman);

export default r;
