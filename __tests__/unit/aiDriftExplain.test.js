import { describe, expect, it } from "@jest/globals";
import {
  explainDriftHeuristic,
  suggestApiRoutesHeuristic,
} from "../../src/modules/ai/ai.service.js";

describe("explainDriftHeuristic", () => {
  it("returns in-sync message when no drift", () => {
    const result = explainDriftHeuristic({ summary: { inSync: true } });
    expect(result.source).toBe("heuristic");
    expect(result.explanation).toContain("matches");
  });

  it("summarizes missing and modified issues", () => {
    const result = explainDriftHeuristic({
      summary: { inSync: false, issueCount: 2 },
      meta: { database: "shop", dialect: "mysql" },
      issues: [
        { type: "missing_in_db", message: "Table orders missing in DB" },
        { type: "type_mismatch", message: "Column users.email type differs" },
      ],
      migration: { statementCount: 3, dialect: "mysql" },
    });
    expect(result.explanation).toContain("Missing in database");
    expect(result.explanation).toContain("Modified");
    expect(result.explanation).toContain("3 SQL statement");
  });
});

describe("suggestApiRoutesHeuristic", () => {
  it("generates CRUD routes per table", () => {
    const result = suggestApiRoutesHeuristic([
      { id: "t1", name: "users", label: "Users" },
    ]);
    expect(result.routes.length).toBe(5);
    expect(result.routes[0].erdTableId).toBe("t1");
    expect(result.routes.some((r) => r.method === "GET" && r.path === "/users")).toBe(true);
  });
});
