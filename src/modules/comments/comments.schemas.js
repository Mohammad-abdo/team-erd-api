import { z } from "zod";
import { CommentableType } from "@prisma/client";

export const listCommentsQuerySchema = z
  .object({
    commentableType: z.nativeEnum(CommentableType).optional(),
    commentableId: z.string().min(1).optional(),
  })
  .refine(
    (q) =>
      (q.commentableType === undefined && q.commentableId === undefined) ||
      (q.commentableType !== undefined && q.commentableId !== undefined),
    { message: "commentableType and commentableId must be provided together" },
  );

export const createCommentSchema = z.object({
  commentableType: z.nativeEnum(CommentableType),
  commentableId: z.string().min(1),
  body: z.string().min(1).max(20000),
  parentId: z.string().min(1).optional(),
});
