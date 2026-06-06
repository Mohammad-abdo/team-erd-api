import { describe, test, expect } from "@jest/globals";
import { validateErdSchema } from "../../src/lib/erdValidation.js";

describe("validateErdSchema", () => {
  test("flags missing primary key", () => {
    const result = validateErdSchema(
      [
        {
          id: "t1",
          name: "users",
          columns: [{ id: "c1", name: "email", isPk: false, isFk: false }],
        },
      ],
      [],
    );
    expect(result.summary.errors).toBe(1);
    expect(result.issues[0].code).toBe("MISSING_PK");
  });

  test("flags orphan FK column and naming warnings", () => {
    const result = validateErdSchema(
      [
        {
          id: "t1",
          name: "UserProfiles",
          columns: [
            { id: "c1", name: "id", isPk: true, isFk: false },
            { id: "c2", name: "userId", isPk: false, isFk: true },
          ],
        },
      ],
      [],
    );
    expect(result.issues.some((i) => i.code === "ORPHAN_FK_COLUMN")).toBe(true);
    expect(result.issues.some((i) => i.code === "TABLE_NAMING")).toBe(true);
    expect(result.issues.some((i) => i.code === "COLUMN_NAMING")).toBe(true);
  });

  test("flags orphan relation endpoints", () => {
    const result = validateErdSchema(
      [{ id: "t1", name: "users", columns: [{ id: "c1", name: "id", isPk: true, isFk: false }] }],
      [{ id: "r1", fromTableId: "missing", toTableId: "t1", fromColumnId: null, toColumnId: "c1" }],
    );
    expect(result.issues.some((i) => i.code === "ORPHAN_RELATION")).toBe(true);
  });

  test("passes clean schema", () => {
    const result = validateErdSchema(
      [
        {
          id: "t1",
          name: "users",
          columns: [{ id: "c1", name: "id", isPk: true, isFk: false }],
        },
        {
          id: "t2",
          name: "orders",
          columns: [
            { id: "c2", name: "id", isPk: true, isFk: false },
            { id: "c3", name: "user_id", isPk: false, isFk: true },
          ],
        },
      ],
      [{ id: "r1", fromTableId: "t2", toTableId: "t1", fromColumnId: "c3", toColumnId: "c1" }],
    );
    expect(result.summary.errors).toBe(0);
    expect(result.summary.warnings).toBe(0);
  });
});
