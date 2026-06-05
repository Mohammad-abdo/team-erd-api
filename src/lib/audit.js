import { prisma } from "./prisma.js";

export async function logAdminAudit({ userId, action, entityType, entityId, meta }) {
  return prisma.adminAuditLog.create({
    data: {
      userId,
      action,
      entityType,
      entityId: entityId ?? null,
      meta: meta ?? undefined,
    },
  });
}
