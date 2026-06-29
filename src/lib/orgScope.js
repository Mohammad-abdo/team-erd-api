import { PlatformRole } from "@prisma/client";
import { prisma } from "./prisma.js";

const DEFAULT_ORG_ID = "org_default";

/** Resolve organization id for a user (falls back to default org). */
export async function getUserOrganizationId(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { organizationId: true, platformRole: true },
  });
  return user?.organizationId ?? DEFAULT_ORG_ID;
}

export function isSuperAdmin(user) {
  return user?.platformRole === PlatformRole.SUPER_ADMIN;
}

export function userIsOrgAdmin(user) {
  return user?.platformRole === PlatformRole.ORG_ADMIN || isSuperAdmin(user);
}

/** SUPER_ADMIN sees all orgs; others scoped to their organizationId. */
export function orgWhereClause(user) {
  if (isSuperAdmin(user)) return {};
  const orgId = user?.organizationId ?? DEFAULT_ORG_ID;
  return { organizationId: orgId };
}

export { DEFAULT_ORG_ID };
