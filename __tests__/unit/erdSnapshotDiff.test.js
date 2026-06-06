import { describe, test, expect } from "@jest/globals";
import { diffErdSchemas } from "../../src/lib/erdSnapshotDiff.js";

describe("diffErdSchemas", () => {
  const base = {
    tables: [
      {
        name: "users",
        label: "Users",
        columns: [
          { name: "id", dataType: "int", isPk: true, isFk: false, isNullable: false, isUnique: false },
          { name: "email", dataType: "varchar(255)", isPk: false, isFk: false, isNullable: false, isUnique: true },
        ],
        indexes: [],
        checkConstraints: [],
      },
    ],
    relations: [],
  };

  test("detects added and removed tables", () => {
    const target = {
      tables: [
        ...base.tables,
        { name: "orders", columns: [], indexes: [], checkConstraints: [] },
      ],
      relations: [],
    };
    const removedTarget = { tables: [], relations: [] };

    const added = diffErdSchemas(base, target);
    expect(added.summary.tablesAdded).toBe(1);
    expect(added.tables.added[0].name).toBe("orders");

    const removed = diffErdSchemas(base, removedTarget);
    expect(removed.summary.tablesRemoved).toBe(1);
    expect(removed.tables.removed[0].name).toBe("users");
  });

  test("detects modified columns and relations", () => {
    const target = {
      tables: [
        {
          ...base.tables[0],
          columns: [
            base.tables[0].columns[0],
            { ...base.tables[0].columns[1], dataType: "varchar(320)" },
            { name: "name", dataType: "varchar(120)", isPk: false, isFk: false, isNullable: true, isUnique: false },
          ],
          indexes: [{ name: "idx_email", columnNames: ["email"], isUnique: false }],
          checkConstraints: [{ name: "chk_email", expression: "email <> ''" }],
        },
      ],
      relations: [
        {
          fromTable: "orders",
          toTable: "users",
          fromColumn: "user_id",
          toColumn: "id",
          relationType: "ONE_TO_MANY",
          label: null,
        },
      ],
    };

    const result = diffErdSchemas(base, target);
    expect(result.summary.tablesModified).toBe(1);
    expect(result.tables.modified[0].columns.modified).toHaveLength(1);
    expect(result.tables.modified[0].columns.added).toHaveLength(1);
    expect(result.tables.modified[0].indexes.added).toHaveLength(1);
    expect(result.tables.modified[0].checkConstraints.added).toHaveLength(1);
    expect(result.summary.relationsAdded).toBe(1);
  });

  test("reports no changes for identical schemas", () => {
    const result = diffErdSchemas(base, structuredClone(base));
    expect(result.summary.hasChanges).toBe(false);
  });
});
