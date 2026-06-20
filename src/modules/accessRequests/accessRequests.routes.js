import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { loadProjectMember } from "../../middleware/projectAccess.js";
import { blockClientUsers } from "../../middleware/clientPortal.js";
import {
  createAccessRequestSchema,
  reviewAccessRequestSchema,
} from "./accessRequests.schemas.js";
import * as accessRequestsController from "./accessRequests.controller.js";

const projectRoutes = Router({ mergeParams: true });
projectRoutes.use(requireAuth);
projectRoutes.use(loadProjectMember);
projectRoutes.use(blockClientUsers);
projectRoutes.post("/", validate(createAccessRequestSchema), accessRequestsController.create);
projectRoutes.get("/", accessRequestsController.listForProject);

const globalRoutes = Router();
globalRoutes.use(requireAuth);
globalRoutes.patch(
  "/:requestId",
  validate(reviewAccessRequestSchema),
  accessRequestsController.review,
);

export { projectRoutes as accessRequestProjectRoutes, globalRoutes as accessRequestRoutes };
