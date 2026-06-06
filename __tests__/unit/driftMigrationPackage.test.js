import { describe, expect, it } from "@jest/globals";
import { buildPrismaMigrationPackage } from "../../src/lib/driftMigrationPackage.js";

describe("buildPrismaMigrationPackage", () => {
  it("wraps drift SQL with prisma folder metadata", () => {
    const pkg = buildPrismaMigrationPackage(
      {
        migration: { sql: "CREATE TABLE t1 (id INT);", statementCount: 1, dialect: "mysql" },
        meta: { dialect: "mysql" },
      },
      { folderStamp: "20260606120000" },
    );
    expect(pkg.folderName).toBe("20260606120000_drift_sync");
    expect(pkg.files).toHaveLength(2);
    expect(pkg.files[0].path).toContain("migration.sql");
    expect(pkg.migrationSql).toContain("CREATE TABLE t1");
    expect(pkg.migrationSql).toContain("prisma/migrations");
    expect(pkg.readme).toContain("migrate deploy");
  });
});
