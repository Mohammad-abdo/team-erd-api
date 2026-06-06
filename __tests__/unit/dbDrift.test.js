import { describe, test, expect } from "@jest/globals";
import { detectDbDrift, normalizeDataType } from "../../src/lib/dbDrift.js";

describe("normalizeDataType", () => {
  test("lowercases and strips spaces", () => {
    expect(normalizeDataType(" VARCHAR(255) ")).toBe("varchar(255)");
  });
});

describe("detectDbDrift", () => {
  const erd = {
    tables: [
      {
        name: "users",
        columns: [
          { name: "id", dataType: "int", isPk: true, isFk: false, isNullable: false, isUnique: false },
          { name: "email", dataType: "varchar(255)", isPk: false, isFk: false, isNullable: false, isUnique: true },
        ],
        indexes: [],
        checkConstraints: [],
      },
      {
        name: "orders",
        columns: [
          { name: "id", dataType: "int", isPk: true, isFk: false, isNullable: false, isUnique: false },
        ],
        indexes: [],
        checkConstraints: [],
      },
    ],
    relations: [
      {
        fromTable: "orders",
        toTable: "users",
        fromColumn: "user_id",
        toColumn: "id",
        relationType: "ONE_TO_MANY",
      },
    ],
  };

  test("reports in sync when schemas match", () => {
    const db = {
      tables: erd.tables,
      relations: erd.relations,
      meta: { dialect: "mysql", database: "app" },
    };
    const report = detectDbDrift(erd, db, db.meta);
    expect(report.summary.inSync).toBe(true);
    expect(report.summary.issueCount).toBe(0);
    expect(report.issues).toHaveLength(0);
  });

  test("detects table missing in database", () => {
    const db = {
      tables: [erd.tables[0]],
      relations: [],
      meta: { dialect: "mysql", database: "app" },
    };
    const report = detectDbDrift(erd, db, db.meta);
    expect(report.summary.inSync).toBe(false);
    expect(report.issues.some((i) => i.type === "missing_in_db" && i.table === "orders")).toBe(true);
  });

  test("detects extra table in database", () => {
    const db = {
      tables: [
        ...erd.tables,
        { name: "audit_log", columns: [{ name: "id", dataType: "int", isPk: true, isFk: false, isNullable: false, isUnique: false }], indexes: [], checkConstraints: [] },
      ],
      relations: erd.relations,
      meta: { dialect: "mysql", database: "app" },
    };
    const report = detectDbDrift(erd, db, db.meta);
    expect(report.issues.some((i) => i.type === "extra_in_db" && i.table === "audit_log")).toBe(true);
  });

  test("detects column type mismatch case-insensitively", () => {
    const db = {
      tables: [
        {
          name: "users",
          columns: [
            erd.tables[0].columns[0],
            { ...erd.tables[0].columns[1], dataType: "VARCHAR(255)" },
          ],
        },
        erd.tables[1],
      ],
      relations: erd.relations,
      meta: { dialect: "mysql", database: "app" },
    };
    const report = detectDbDrift(erd, db, db.meta);
    expect(report.summary.inSync).toBe(true);
  });

  test("detects real column type mismatch", () => {
    const db = {
      tables: [
        {
          name: "users",
          columns: [
            erd.tables[0].columns[0],
            { ...erd.tables[0].columns[1], dataType: "text" },
          ],
        },
        erd.tables[1],
      ],
      relations: erd.relations,
      meta: { dialect: "mysql", database: "app" },
    };
    const report = detectDbDrift(erd, db, db.meta);
    expect(report.issues.some((i) => i.type === "type_mismatch" && i.column === "email")).toBe(true);
  });
});
