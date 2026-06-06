import { describe, test, expect } from "@jest/globals";
import { formatDriftReportRow } from "../../src/modules/import/driftReports.service.js";

describe("driftPortfolio helpers", () => {
  test("formatDriftReportRow exposes migration for packages", () => {
    const row = formatDriftReportRow({
      id: "r1",
      dialect: "mysql",
      databaseLabel: "app.staging",
      inSync: false,
      issueCount: 2,
      createdAt: new Date("2026-06-06T10:00:00.000Z"),
      checkedBy: { id: "u1", name: "Ada", email: "ada@test.com" },
      reportJson: {
        summary: { inSync: false, issueCount: 2 },
        migration: { sql: "ALTER TABLE t ADD c INT;", dialect: "mysql", statementCount: 1 },
      },
    });
    expect(row.migration?.sql).toContain("ALTER TABLE");
    expect(row.issueCount).toBe(2);
  });
});
