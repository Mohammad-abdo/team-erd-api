import { asyncHandler } from "../../utils/asyncHandler.js";
import { introspectMysqlSchema, introspectPostgresSchema } from "../../lib/sqlIntrospect.js";
import * as importService from "./import.service.js";
import * as driftService from "./drift.service.js";
import * as dbProfilesService from "./dbProfiles.service.js";
import * as driftScheduleService from "./driftSchedule.service.js";
import { logDbAccessAudit } from "../../lib/securityAudit.js";
import { buildPrismaMigrationPackage } from "../../lib/driftMigrationPackage.js";

export const importErdSchema = asyncHandler(async (req, res) => {
  const result = await importService.importErdSchema(
    req.params.projectId,
    req.user.sub,
    req.body,
  );
  res.status(201).json(result);
});

export const importApiDocs = asyncHandler(async (req, res) => {
  const result = await importService.importApiDocs(
    req.params.projectId,
    req.user.sub,
    req.body,
  );
  res.status(201).json(result);
});

export const importSwagger = asyncHandler(async (req, res) => {
  const result = await importService.importSwagger(
    req.params.projectId,
    req.user.sub,
    req.body,
  );
  res.status(201).json(result);
});

export const importPostman = asyncHandler(async (req, res) => {
  const result = await importService.importPostman(
    req.params.projectId,
    req.user.sub,
    req.body,
  );
  res.status(201).json(result);
});

export const previewMysqlIntrospect = asyncHandler(async (req, res) => {
  const { tables, relations, meta } = await introspectMysqlSchema(req.body);
  await logDbAccessAudit({
    userId: req.user.sub,
    projectId: req.params.projectId,
    operation: "db_introspect_preview",
    dialect: "mysql",
    connection: req.body,
    result: { tableCount: tables.length, relationCount: relations.length },
  });
  res.json({ tables, relations, meta });
});

export const importMysqlIntrospect = asyncHandler(async (req, res) => {
  const { tables, relations, meta } = await introspectMysqlSchema(req.body);
  const result = await importService.importErdSchema(req.params.projectId, req.user.sub, {
    tables,
    relations,
    clearExisting: req.body.clearExisting ?? false,
  });
  await logDbAccessAudit({
    userId: req.user.sub,
    projectId: req.params.projectId,
    operation: "db_introspect_import",
    dialect: "mysql",
    connection: req.body,
    result: { tableCount: tables.length, relationCount: relations.length, imported: true },
  });
  res.status(201).json({ ...result, meta });
});

export const previewPostgresIntrospect = asyncHandler(async (req, res) => {
  const { tables, relations, meta } = await introspectPostgresSchema(req.body);
  await logDbAccessAudit({
    userId: req.user.sub,
    projectId: req.params.projectId,
    operation: "db_introspect_preview",
    dialect: "postgres",
    connection: req.body,
    result: { tableCount: tables.length, relationCount: relations.length },
  });
  res.json({ tables, relations, meta });
});

export const importPostgresIntrospect = asyncHandler(async (req, res) => {
  const { tables, relations, meta } = await introspectPostgresSchema(req.body);
  const result = await importService.importErdSchema(req.params.projectId, req.user.sub, {
    tables,
    relations,
    clearExisting: req.body.clearExisting ?? false,
  });
  await logDbAccessAudit({
    userId: req.user.sub,
    projectId: req.params.projectId,
    operation: "db_introspect_import",
    dialect: "postgres",
    connection: req.body,
    result: { tableCount: tables.length, relationCount: relations.length, imported: true },
  });
  res.status(201).json({ ...result, meta });
});

export const checkMysqlDrift = asyncHandler(async (req, res) => {
  const report = await driftService.checkDrift(
    req.params.projectId,
    req.user.sub,
    "mysql",
    req.body,
  );
  res.json(report);
});

export const checkPostgresDrift = asyncHandler(async (req, res) => {
  const report = await driftService.checkDrift(
    req.params.projectId,
    req.user.sub,
    "postgres",
    req.body,
  );
  res.json(report);
});

export const getLatestDrift = asyncHandler(async (req, res) => {
  const report = await driftService.getLatestDriftReport(req.params.projectId);
  res.json({ report });
});

export const listDriftHistory = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 25);
  const reports = await driftService.listDriftReports(req.params.projectId, limit);
  res.json({ reports });
});

export const getDriftMigrationPackage = asyncHandler(async (req, res) => {
  const report = await driftService.getLatestDriftReport(req.params.projectId);
  if (!report || report.inSync) {
    return res.status(404).json({
      error: report?.inSync
        ? "Schemas are in sync — no migration package needed"
        : "No drift report found — run a drift check first",
    });
  }
  const pkg = buildPrismaMigrationPackage({
    summary: report.summary,
    meta: report.meta,
    migration: report.migration,
  });
  res.json({ package: pkg });
});

export const listDbProfiles = asyncHandler(async (req, res) => {
  const profiles = await dbProfilesService.listDbProfiles(req.params.projectId, {
    environment: req.query.environment,
  });
  res.json({ profiles });
});

export const createDbProfile = asyncHandler(async (req, res) => {
  const profile = await dbProfilesService.createDbProfile(
    req.params.projectId,
    req.user.sub,
    req.body,
  );
  res.status(201).json({ profile });
});

export const updateDbProfile = asyncHandler(async (req, res) => {
  const profile = await dbProfilesService.updateDbProfile(
    req.params.projectId,
    req.params.profileId,
    req.body,
  );
  res.json({ profile });
});

export const deleteDbProfile = asyncHandler(async (req, res) => {
  await dbProfilesService.deleteDbProfile(req.params.projectId, req.params.profileId);
  res.status(204).end();
});

export const getDriftSchedule = asyncHandler(async (req, res) => {
  const schedule = await driftScheduleService.getDriftSchedule(req.params.projectId);
  res.json({ schedule });
});

export const upsertDriftSchedule = asyncHandler(async (req, res) => {
  const schedule = await driftScheduleService.upsertDriftSchedule(
    req.params.projectId,
    req.user.sub,
    req.body,
  );
  res.json({ schedule });
});

export const deleteDriftSchedule = asyncHandler(async (req, res) => {
  await driftScheduleService.deleteDriftSchedule(req.params.projectId);
  res.status(204).end();
});
