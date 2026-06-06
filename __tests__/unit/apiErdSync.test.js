import { describe, expect, it } from "@jest/globals";
import { analyzeApiErdSync, extractPathResourceNames } from "../../src/lib/apiErdSync.js";

describe("extractPathResourceNames", () => {
  it("skips params and api prefix segments", () => {
    expect(extractPathResourceNames("/api/v1/users/:id/orders")).toEqual(["users", "orders"]);
  });
});

describe("analyzeApiErdSync", () => {
  const tables = [
    { id: "t1", name: "users" },
    { id: "t2", name: "order" },
  ];

  it("flags unknown table from path", () => {
    const result = analyzeApiErdSync(tables, [
      {
        id: "r1",
        method: "GET",
        path: "/invoices",
        erdLinks: [],
        parameters: [],
        responses: [],
      },
    ]);
    expect(result.issues.some((i) => i.type === "unknown_table" && i.tableName === "invoices")).toBe(true);
  });

  it("flags missing erd link when table exists", () => {
    const result = analyzeApiErdSync(tables, [
      {
        id: "r2",
        method: "GET",
        path: "/users",
        erdLinks: [],
        parameters: [],
        responses: [],
      },
    ]);
    expect(result.issues.some((i) => i.type === "missing_erd_link" && i.tableName === "users")).toBe(true);
  });

  it("counts linked route coverage", () => {
    const result = analyzeApiErdSync(tables, [
      {
        id: "r3",
        method: "GET",
        path: "/users",
        erdLinks: [{ erdTableId: "t1", erdTable: { name: "users" } }],
        parameters: [],
        responses: [],
      },
    ]);
    expect(result.summary.routesWithLinks).toBe(1);
    expect(result.summary.coveragePercent).toBe(100);
  });
});
