import { Router } from "express";
import { ProjectMemberRole } from "@prisma/client";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import {
  loadProjectMember,
  requireProjectRole,
} from "../../middleware/projectAccess.js";
import { listCommentsQuerySchema, createCommentSchema } from "./comments.schemas.js";
import * as commentsController from "./comments.controller.js";

const r = Router({ mergeParams: true });

r.use(requireAuth);
r.use(loadProjectMember);

const viewer = requireProjectRole(ProjectMemberRole.VIEWER);

r.get("/", viewer, validate(listCommentsQuerySchema, "query"), commentsController.list);
r.post("/", viewer, validate(createCommentSchema), commentsController.create);
r.put("/:commentId/resolve", viewer, commentsController.resolve);

export default r;
