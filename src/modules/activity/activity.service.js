import { prisma } from "../../lib/prisma.js";

/**
 * @param {object} input
 * @param {string} input.projectId
 * @param {string | null} [input.userId]
 * @param {string} input.action
 * @param {string} input.entityType
 * @param {string} input.entityId
 * @param {unknown} [input.oldValues]
 * @param {unknown} [input.newValues]
 */
export async function logActivity(input) {
  await prisma.activityLog.create({
    data: {
      projectId: input.projectId,
      userId: input.userId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      oldValues: input.oldValues === undefined ? undefined : input.oldValues,
      newValues: input.newValues === undefined ? undefined : input.newValues,
    },
  });
}
