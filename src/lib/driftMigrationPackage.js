import { HttpError } from "../utils/httpError.js";

export function buildPrismaMigrationPackage(report, options = {}) {
  const sql = report?.migration?.sql?.trim();
  if (!sql) {
    throw new HttpError(404, "No migration SQL in drift report — run a drift check first");
  }

  const now = new Date();
  const stamp = options.folderStamp
    ?? `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}`;
  const folderName = `${stamp}_drift_sync`;
  const dialect = report.migration.dialect ?? report.meta?.dialect ?? "mysql";

  const header = [
    "-- DBForge drift → Prisma migration package",
    `-- Target folder: prisma/migrations/${folderName}/migration.sql`,
    `-- Dialect: ${dialect}`,
    `-- Statements: ${report.migration.statementCount ?? "?"}`,
    `-- Generated: ${now.toISOString()}`,
    "-- Review all statements before applying to production.",
    "",
  ].join("\n");

  const readme = [
    "# Drift migration package",
    "",
    `1. Create folder \`prisma/migrations/${folderName}/\` in your app repo`,
    "2. Save `migration.sql` inside that folder (this download)",
    "3. Run `npx prisma migrate deploy` (or `migrate dev` locally)",
    "",
    `Dialect: ${dialect}`,
    `Statements: ${report.migration.statementCount ?? "?"}`,
    "",
    "This SQL was generated from your DBForge ERD vs live database drift report.",
    "Always test on staging first.",
  ].join("\n");

  return {
    folderName,
    dialect,
    statementCount: report.migration.statementCount ?? 0,
    migrationSql: `${header}${sql}\n`,
    readme,
    relativePath: `prisma/migrations/${folderName}/migration.sql`,
  };
}
