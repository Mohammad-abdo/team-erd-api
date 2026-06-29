import fs from "fs";
import { CommentableType, ProjectMemberRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { emitToProject } from "../../sockets/emit.js";
import { logActivity } from "../activity/activity.service.js";
import { hasMinRole } from "../../lib/permissions.js";
import { absoluteStoragePath, relativeStoragePath } from "../../lib/commentUpload.js";
import { notifyCommentActivity } from "../notifications/commentNotifications.js";

const userSelect = { id: true, name: true, email: true, avatar: true };
const attachmentSelect = {
  id: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  createdAt: true,
};

const commentInclude = {
  user: { select: userSelect },
  attachments: { select: attachmentSelect, orderBy: { createdAt: "asc" } },
  replies: {
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: userSelect },
      attachments: { select: attachmentSelect, orderBy: { createdAt: "asc" } },
    },
  },
};

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
  } else if (type === CommentableType.TASK) {
    const row = await prisma.projectTask.findFirst({ where: { id, projectId } });
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
    include: commentInclude,
  });
}

export async function createComment(projectId, userId, memberRole, input, files = []) {
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
      ...(files.length
        ? {
            attachments: {
              create: files.map((f) => ({
                fileName: f.originalname || f.filename,
                mimeType: f.mimetype || "application/octet-stream",
                sizeBytes: f.size,
                storagePath: relativeStoragePath(projectId, f.filename),
              })),
            },
          }
        : {}),
    },
    include: commentInclude,
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

  await notifyCommentActivity({
    projectId,
    actorId: userId,
    comment,
    parentId: input.parentId ?? null,
  });

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

export async function getCommentAttachment(projectId, attachmentId) {
  const row = await prisma.commentAttachment.findFirst({
    where: {
      id: attachmentId,
      comment: { projectId },
    },
    include: {
      comment: { select: { projectId: true } },
    },
  });
  if (!row) {
    throw new HttpError(404, "Attachment not found");
  }

  const abs = absoluteStoragePath(row.storagePath);
  if (!fs.existsSync(abs)) {
    throw new HttpError(404, "Attachment file missing on server");
  }

  return { row, abs };
}
