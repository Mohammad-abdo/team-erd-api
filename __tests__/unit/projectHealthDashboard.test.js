import { describe, expect, it } from "@jest/globals";
import { computeProjectHealthDashboard } from "../../src/modules/projects/projectHealthDashboard.js";

describe("computeProjectHealthDashboard", () => {
  const richStats = {
    tables: 5,
    relations: 4,
    columns: 20,
    apiRoutes: 8,
    apiGroups: 2,
    members: 3,
  };

  it("returns high overall score for a well-documented project", () => {
    const result = computeProjectHealthDashboard(richStats, 0, { errors: 0, warnings: 0 });
    expect(result.overall).toBeGreaterThanOrEqual(70);
    expect(result.categories).toHaveLength(5);
    expect(result.issues).toHaveLength(0);
  });

  it("flags missing tables and API routes", () => {
    const result = computeProjectHealthDashboard(
      { tables: 0, relations: 0, columns: 0, apiRoutes: 0, apiGroups: 0, members: 1 },
      0,
      null,
    );
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain("NO_TABLES");
    expect(codes).toContain("NO_API_ROUTES");
    expect(codes).toContain("SOLO_PROJECT");
  });

  it("flags validation errors and warnings", () => {
    const result = computeProjectHealthDashboard(richStats, 0, { errors: 2, warnings: 3 });
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain("VALIDATION_ERRORS");
    expect(codes).toContain("VALIDATION_WARNINGS");
  });

  it("flags many open comments", () => {
    const result = computeProjectHealthDashboard(richStats, 5, null);
    expect(result.issues.find((i) => i.code === "OPEN_COMMENTS")?.count).toBe(5);
  });

  it("flags schema drift when last check found issues", () => {
    const result = computeProjectHealthDashboard(
      richStats,
      0,
      { errors: 0, warnings: 0 },
      { checked: true, inSync: false, issueCount: 4, checkedAt: new Date().toISOString(), databaseLabel: "app", dialect: "mysql" },
    );
    expect(result.issues.some((i) => i.code === "SCHEMA_DRIFT")).toBe(true);
    expect(result.overall).toBeLessThan(computeProjectHealthDashboard(richStats, 0, { errors: 0, warnings: 0 }, { checked: true, inSync: true, issueCount: 0 }).overall);
  });

  it("suggests drift check when schema exists but never checked", () => {
    const result = computeProjectHealthDashboard(
      richStats,
      0,
      null,
      { checked: false, inSync: null, issueCount: 0 },
    );
    expect(result.issues.some((i) => i.code === "NO_DRIFT_CHECK")).toBe(true);
  });

  it("marks empty shell projects with zero overall until schema exists", () => {
    const result = computeProjectHealthDashboard(
      { tables: 0, relations: 0, columns: 0, apiRoutes: 1, apiGroups: 1, members: 2 },
      0,
      null,
    );
    expect(result.isEmptyShell).toBe(true);
    expect(result.overall).toBe(0);
    expect(result.categories.every((c) => c.score === 0)).toBe(true);
  });
});
