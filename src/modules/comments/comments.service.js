import { CommentableType, ProjectMemberRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { emitToProject } from "../../sockets/emit.js";
import { logActivity } from "../activity/activity.service.js";
import { hasMinRole } from "../../lib/permissions.js";

async function assertCommentTarget(projectId, type, id) {
  if (type === CommentableType.ERD_TABLE) {
    const row = await prisma.erdTable.findFirst({ where: { id, projectId } });
    if (!row) {
      throw new HttpError(404, "Comment target not found");
    }
  } else if (type === CommentableType.ERD_RELATION) {
    const row = await prisma.erdRelation.findFirst({ where: { id, projectId } });
    if (!row) {
      throw new HttpError(404, "Comment target not found");
    }
  } else if (type === CommentableType.API_ROUTE) {
    const row = await prisma.apiRoute.findFirst({
      where: { id, group: { projectId } },
    });
    if (!row) {
      throw new HttpError(404, "Comment target not found");
    }
  }
}

export async function listComments(projectId, query) {
  const where = {
    projectId,
    parentId: null,
    ...(query.commentableType && query.commentableId
      ? {
          commentableType: query.commentableType,
          commentableId: query.commentableId,
        }
      : {}),
  };

  return prisma.comment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, name: true, email: true, avatar: true } },
      replies: {
        orderBy: { createdAt: "asc" },
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true } },
        },
      },
    },
  });
}

export async function createComment(projectId, userId, memberRole, input) {
  if (!hasMinRole(memberRole, ProjectMemberRole.COMMENTER)) {
    throw new HttpError(403, "Your role cannot create comments");
  }

  await assertCommentTarget(projectId, input.commentableType, input.commentableId);

  if (input.parentId) {
    const parent = await prisma.comment.findFirst({
      where: { id: input.parentId, projectId },
    });
    if (!parent) {
      throw new HttpError(404, "Parent comment not found");
    }
  }

  const comment = await prisma.comment.create({
    data: {
      projectId,
      commentableType: input.commentableType,
      commentableId: input.commentableId,
      userId,
      body: input.body.trim(),
      parentId: input.parentId ?? null,
    },
    include: {
      user: { select: { id: true, name: true, email: true, avatar: true } },
    },
  });

  await logActivity({
    projectId,
    userId,
    action: "created",
    entityType: "comment",
    entityId: comment.id,
    newValues: { commentableType: input.commentableType, commentableId: input.commentableId },
  });

  emitToProject(projectId, "comments:updated", { at: Date.now() });

  return comment;
}

export async function resolveComment(projectId, userId, memberRole, commentId) {
  const comment = await prisma.comment.findFirst({
    where: { id: commentId, projectId },
  });
  if (!comment) {
    throw new HttpError(404, "Comment not found");
  }

  const canResolve =
    comment.userId === userId ||
    hasMinRole(memberRole, ProjectMemberRole.EDITOR);

  if (!canResolve) {
    throw new HttpError(403, "Cannot resolve this comment");
  }

  const updated = await prisma.comment.update({
    where: { id: commentId },
    data: { resolvedAt: new Date() },
    include: {
      user: { select: { id: true, name: true, email: true, avatar: true } },
    },
  });

  await logActivity({
    projectId,
    userId,
    action: "updated",
    entityType: "comment",
    entityId: commentId,
    newValues: { resolvedAt: updated.resolvedAt },
  });

  emitToProject(projectId, "comments:updated", { at: Date.now() });

  return updated;
}
