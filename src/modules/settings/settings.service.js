import { prisma } from "../../lib/prisma.js";
import { logAdminAudit } from "../../lib/audit.js";

export const PLATFORM_SETTINGS_ID = "default";

/** @param {import("@prisma/client").PlatformSetting | null | undefined} row */
export function serializeBranding(row) {
  return {
    logoUrl: row?.logoUrl ?? "",
    workspaceTitle: row?.workspaceTitle ?? "",
    workspaceTagline: row?.workspaceTagline ?? "",
    updatedAt: row?.updatedAt ?? null,
  };
}

export async function getPlatformBranding() {
  const row = await prisma.platformSetting.findUnique({
    where: { id: PLATFORM_SETTINGS_ID },
  });
  return serializeBranding(row);
}

export async function getPlatformSettings() {
  const branding = await getPlatformBranding();
  return { branding };
}

function normalizeOptionalText(value) {
  if (value === undefined) return undefined;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

export async function updatePlatformBranding(adminId, input) {
  const data = {};
  if (input.logoUrl !== undefined) data.logoUrl = normalizeOptionalText(input.logoUrl);
  if (input.workspaceTitle !== undefined) data.workspaceTitle = normalizeOptionalText(input.workspaceTitle);
  if (input.workspaceTagline !== undefined) data.workspaceTagline = normalizeOptionalText(input.workspaceTagline);

  const row = await prisma.platformSetting.upsert({
    where: { id: PLATFORM_SETTINGS_ID },
    create: {
      id: PLATFORM_SETTINGS_ID,
      ...data,
      updatedById: adminId,
    },
    update: {
      ...data,
      updatedById: adminId,
    },
  });

  await logAdminAudit({
    userId: adminId,
    action: "updated",
    entityType: "platform_settings",
    entityId: PLATFORM_SETTINGS_ID,
    meta: { fields: Object.keys(data) },
  });

  return serializeBranding(row);
}
