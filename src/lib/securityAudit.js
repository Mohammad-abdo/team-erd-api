import { logAdminAudit } from "./audit.js";

export function sanitizeConnectionMeta(connection = {}, extras = {}) {
  return {
    host: connection.host ?? null,
    port: connection.port ?? null,
    user: connection.user ?? null,
    database: connection.database ?? null,
    schema: connection.schema ?? connection.schemaName ?? null,
    profileId: extras.profileId ?? connection.profileId ?? null,
    environment: extras.environment ?? connection.environment ?? null,
  };
}

/**
 * Records who connected to which database (never stores passwords).
 */
export async function logDbAccessAudit({
  userId,
  projectId,
  operation,
  dialect,
  connection,
  profileId,
  result,
}) {
  try {
    await logAdminAudit({
      userId,
      action: operation,
      entityType: "project_db",
      entityId: projectId,
      meta: {
        projectId,
        dialect: dialect ?? null,
        ...sanitizeConnectionMeta(connection, { profileId }),
        ...(result ?? {}),
      },
    });
  } catch {
    /* audit is best-effort */
  }
}
