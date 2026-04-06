import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";

export async function listNotifications(userId, { limit = 50 } = {}) {
  const take = Math.min(Math.max(Number(limit) || 50, 1), 200);

  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function markNotificationRead(userId, notificationId) {
  const row = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
  });
  if (!row) {
    throw new HttpError(404, "Notification not found");
  }

  return prisma.notification.update({
    where: { id: notificationId },
    data: { readAt: new Date() },
  });
}
