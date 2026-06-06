import { HttpError } from "../../utils/httpError.js";
import { detectDbDrift } from "../../lib/dbDrift.js";
import { generateMigrationSql } from "../../lib/migrationGenerator.js";
import { introspectMysqlSchema, introspectPostgresSchema } from "../../lib/sqlIntrospect.js";
import { buildSnapshotPayload } from "../erd/erdSnapshots.service.js";
import { resolveConnection } from "./dbProfiles.service.js";
import { logDbAccessAudit } from "../../lib/securityAudit.js";
import {
  saveDriftReport,
  getLatestDriftReport,
  getDriftReportById,
  listDriftReports,
} from "./driftReports.service.js";

export async function checkDrift(projectId, userId, dialect, connection, options = {}) {
  let resolvedDialect = dialect;
  let conn = connection;
  let profile = null;

  const profileId = connection?.profileId ?? null;

  if (profileId) {
    const resolved = await resolveConnection(projectId, connection);
    resolvedDialect = resolved.dialect;
    conn = resolved.connection;
    profile = resolved.profile;
  }

  if (!conn) {
    throw new HttpError(400, "Database connection or profileId is required");
  }

  const erdSchema = await buildSnapshotPayload(projectId);

  if (!erdSchema.tables.length) {
    throw new HttpError(400, "Project has no ERD tables — add a schema on the whiteboard first");
  }

  let dbPayload;
  if (resolvedDialect === "mysql") {
    dbPayload = await introspectMysqlSchema(conn);
  } else if (resolvedDialect === "postgres") {
    dbPayload = await introspectPostgresSchema(conn);
  } else {
    throw new HttpError(400, "Unsupported database dialect");
  }

  const report = detectDbDrift(erdSchema, dbPayload, dbPayload.meta);
  const migration = generateMigrationSql(erdSchema, report, resolvedDialect);
  const full = { ...report, migration };

  const saved = await saveDriftReport(projectId, userId, full, options);

  await logDbAccessAudit({
    userId,
    projectId,
    operation: "drift_check",
    dialect: resolvedDialect,
    connection: { ...conn, environment: profile?.environment ?? null },
    profileId,
    result: {
      inSync: Boolean(report.summary?.inSync),
      issueCount: report.summary?.issueCount ?? 0,
      source: options.source ?? "manual",
    },
  });

  return { ...full, savedReportId: saved.id, checkedAt: saved.checkedAt };
}

export { getLatestDriftReport, getDriftReportById, listDriftReports };
