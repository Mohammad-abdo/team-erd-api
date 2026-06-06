import { asyncHandler } from "../../utils/asyncHandler.js";
import { createCommentSchema } from "./comments.schemas.js";
import * as commentsService from "./comments.service.js";

export const list = asyncHandler(async (req, res) => {
  const comments = await commentsService.listComments(req.params.projectId, req.query);
  res.json({ comments });
});

export const create = asyncHandler(async (req, res) => {
  const parsed = createCommentSchema.parse({
    commentableType: req.body.commentableType,
    commentableId: req.body.commentableId,
    body: req.body.body,
    parentId: req.body.parentId || undefined,
  });
  const comment = await commentsService.createComment(
    req.params.projectId,
    req.user.sub,
    req.projectMember.role,
    parsed,
    req.files ?? [],
  );
  res.status(201).json({ comment });
});

export const downloadAttachment = asyncHandler(async (req, res) => {
  const { row, abs } = await commentsService.getCommentAttachment(
    req.params.projectId,
    req.params.attachmentId,
  );
  res.setHeader("Content-Type", row.mimeType);
  res.setHeader("Content-Disposition", `inline; filename="${row.fileName.replace(/"/g, "")}"`);
  res.sendFile(abs);
});

export const resolve = asyncHandler(async (req, res) => {
  const comment = await commentsService.resolveComment(
    req.params.projectId,
    req.user.sub,
    req.projectMember.role,
    req.params.commentId,
  );
  res.json({ comment });
});
