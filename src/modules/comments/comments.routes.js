import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import {
  loadProjectMember,
  requireProjectPermission,
  PermissionResource,
  PermissionAction,
} from "../../middleware/projectAccess.js";
import { listCommentsQuerySchema } from "./comments.schemas.js";
import { commentUploadHandler } from "../../lib/commentUpload.js";
import * as commentsController from "./comments.controller.js";

const r = Router({ mergeParams: true });

r.use(requireAuth);
r.use(loadProjectMember);

const commentsView = requireProjectPermission(PermissionResource.COMMENTS, PermissionAction.VIEW);
const commentsCreate = requireProjectPermission(PermissionResource.COMMENTS, PermissionAction.CREATE);
const commentsEdit = requireProjectPermission(PermissionResource.COMMENTS, PermissionAction.EDIT);

r.get("/", commentsView, validate(listCommentsQuerySchema, "query"), commentsController.list);
r.get("/attachments/:attachmentId", commentsView, commentsController.downloadAttachment);
r.post("/", commentsCreate, commentUploadHandler, commentsController.create);
r.put("/:commentId/resolve", commentsEdit, commentsController.resolve);

export default r;
