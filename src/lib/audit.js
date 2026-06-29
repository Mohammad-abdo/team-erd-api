import { prisma } from "./prisma.js";
import { getUserOrganizationId } from "./orgScope.js";

export async function logAdminAudit({ userId, organizationId, action, entityType, entityId, meta }) {
  let orgId = organizationId ?? null;
  if (orgId === undefined && userId) {
    orgId = await getUserOrganizationId(userId);
  }
  return prisma.adminAuditLog.create({
    data: {
      userId,
      organizationId: orgId ?? null,
      action,
      entityType,
      entityId: entityId ?? null,
      meta: meta ?? undefined,
    },
  });
}
