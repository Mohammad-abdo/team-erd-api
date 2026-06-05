import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import {
  loadProjectMember,
  requireProjectLeader,
} from "../../middleware/projectAccess.js";
import {
  upsertPermissionSchema,
  deletePermissionSchema,
} from "./permissions.schemas.js";
import * as permissionsController from "./permissions.controller.js";

const r = Router({ mergeParams: true });

r.use(requireAuth);
r.use(loadProjectMember);
r.use(requireProjectLeader);

r.get("/", permissionsController.list);
r.post("/", validate(upsertPermissionSchema), permissionsController.grant);
r.post("/revoke", validate(deletePermissionSchema), permissionsController.revoke);

export default r;
