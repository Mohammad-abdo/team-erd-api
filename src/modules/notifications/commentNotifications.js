import { prisma } from "../../lib/prisma.js";
import { deliverToUsers } from "../../lib/notify.js";
import { filterMentionsToMembers } from "../../lib/mentions.js";

async function projectMemberIds(projectId) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      name: true,
      leaderId: true,
      members: { select: { userId: true } },
    },
  });
  if (!project) return { projectName: "", memberIds: new Set() };
  const ids = new Set([
    project.leaderId,
    ...project.members.map((m) => m.userId),
  ].filter(Boolean));
  return { projectName: project.name, memberIds: ids };
}

export async function notifyCommentActivity({
  projectId,
  actorId,
  comment,
  parentId,
}) {
  const { projectName, memberIds } = await projectMemberIds(projectId);
  if (!memberIds.size) return;

  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { name: true },
  });
  const actorName = actor?.name ?? "A teammate";

  const mentionedIds = filterMentionsToMembers(comment.body, memberIds)
    .filter((id) => id !== actorId);

  if (mentionedIds.length) {
    await deliverToUsers(mentionedIds, {
      type: "comment_mention",
      title: `${actorName} mentioned you`,
      body: `In ${projectName}: ${comment.body.slice(0, 160)}`,
      data: {
        projectId,
        commentId: comment.id,
        commentableType: comment.commentableType,
        commentableId: comment.commentableId,
      },
    });
  }

  if (parentId) {
    const parent = await prisma.comment.findFirst({
      where: { id: parentId, projectId },
      select: { userId: true },
    });
    const parentAuthorId = parent?.userId;
    if (
      parentAuthorId
      && parentAuthorId !== actorId
      && !mentionedIds.includes(parentAuthorId)
    ) {
      await deliverToUsers([parentAuthorId], {
        type: "comment_reply",
        title: `${actorName} replied to your comment`,
        body: `In ${projectName}: ${comment.body.slice(0, 160)}`,
        data: {
          projectId,
          commentId: comment.id,
          parentId,
          commentableType: comment.commentableType,
          commentableId: comment.commentableId,
        },
      });
    }
  }
}
