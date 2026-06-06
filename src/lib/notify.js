import { prisma } from "./prisma.js";
import { emitToUser } from "../sockets/emit.js";
import { shouldNotify } from "./notificationPrefs.js";

/**
 * Create and push a notification when the recipient allows this type.
 * @returns {Promise<object | null>}
 */
export async function deliverNotification({ userId, type, title, body, data }) {
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationPrefs: true, isActive: true },
  });
  if (!user?.isActive) return null;
  if (!shouldNotify(user.notificationPrefs, type)) return null;

  const notification = await prisma.notification.create({
    data: { userId, type, title, body, data: data ?? undefined },
  });
  emitToUser(userId, "notification:new", { notification });
  return notification;
}

/** @param {string[]} userIds */
export async function deliverToUsers(userIds, payload) {
  const unique = [...new Set(userIds.filter(Boolean))];
  const created = [];
  for (const userId of unique) {
    const row = await deliverNotification({ userId, ...payload });
    if (row) created.push(row);
  }
  return created;
}
