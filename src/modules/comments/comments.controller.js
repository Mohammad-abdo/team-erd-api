import { asyncHandler } from "../../utils/asyncHandler.js";
import * as commentsService from "./comments.service.js";

export const list = asyncHandler(async (req, res) => {
  const comments = await commentsService.listComments(req.params.projectId, req.query);
  res.json({ comments });
});

export const create = asyncHandler(async (req, res) => {
  const comment = await commentsService.createComment(
    req.params.projectId,
    req.user.sub,
    req.projectMember.role,
    req.body,
  );
  res.status(201).json({ comment });
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
