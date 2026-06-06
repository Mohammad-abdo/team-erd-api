import { describe, test, expect } from "@jest/globals";
import { generateMigrationSql } from "../../src/lib/migrationGenerator.js";

describe("generateMigrationSql", () => {
  const erdSchema = {
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
          { name: "user_id", dataType: "int", isPk: false, isFk: true, isNullable: false, isUnique: false },
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

  test("returns no-op message when in sync", () => {
    const report = { summary: { hasDrift: false }, issues: [], diff: {} };
    const result = generateMigrationSql(erdSchema, report, "mysql");
    expect(result.statementCount).toBe(0);
    expect(result.sql).toContain("in sync");
  });

  test("generates CREATE TABLE for missing table", () => {
    const report = {
      summary: { hasDrift: true },
      issues: [{ type: "missing_in_db", category: "table", table: "orders" }],
      diff: {
        tables: { removed: [{ name: "orders" }], added: [], modified: [] },
        relations: { added: [], removed: [], modified: [] },
      },
    };
    const result = generateMigrationSql(erdSchema, report, "mysql");
    expect(result.sql).toContain("CREATE TABLE `orders`");
    expect(result.sql).toContain("`user_id`");
    expect(result.statementCount).toBeGreaterThan(0);
  });

  test("generates ADD COLUMN for missing column", () => {
    const report = {
      summary: { hasDrift: true },
      issues: [{ type: "missing_in_db", category: "column", table: "users", column: "email" }],
      diff: {
        tables: {
          removed: [],
          added: [],
          modified: [
            {
              name: "users",
              columns: {
                removed: [{ name: "email", dataType: "varchar(255)", isPk: false, isFk: false, isNullable: false, isUnique: true }],
                added: [],
                modified: [],
              },
            },
          ],
        },
        relations: { added: [], removed: [], modified: [] },
      },
    };
    const result = generateMigrationSql(erdSchema, report, "mysql");
    expect(result.sql).toContain("ALTER TABLE `users` ADD COLUMN `email`");
  });

  test("generates MODIFY COLUMN for type mismatch", () => {
    const report = {
      summary: { hasDrift: true },
      issues: [{ type: "type_mismatch", table: "users", column: "email" }],
      diff: {
        tables: {
          removed: [],
          added: [],
          modified: [
            {
              name: "users",
              columns: {
                removed: [],
                added: [],
                modified: [
                  {
                    after: { name: "email" },
                    changes: [{ field: "dataType", before: "varchar(255)", after: "text" }],
                  },
                ],
              },
            },
          ],
        },
        relations: { added: [], removed: [], modified: [] },
      },
    };
    const result = generateMigrationSql(erdSchema, report, "mysql");
    expect(result.sql).toContain("MODIFY COLUMN `email` varchar(255)");
  });

  test("generates FK and commented drops for extras", () => {
    const report = {
      summary: { hasDrift: true },
      issues: [
        { type: "missing_in_db", category: "relation", fromTable: "orders", toTable: "users", fromColumn: "user_id", toColumn: "id" },
        { type: "extra_in_db", category: "table", table: "audit_log" },
      ],
      diff: {
        tables: { removed: [], added: [{ name: "audit_log" }], modified: [] },
        relations: {
          removed: [{ fromTable: "orders", toTable: "users", fromColumn: "user_id", toColumn: "id" }],
          added: [],
          modified: [],
        },
      },
    };
    const result = generateMigrationSql(erdSchema, report, "mysql");
    expect(result.sql).toContain("FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)");
    expect(result.sql).toContain("-- DROP TABLE `audit_log`");
    expect(result.hasOptionalDrops).toBe(true);
  });

  test("generates CREATE INDEX for missing indexes", () => {
    const erdWithIndex = {
      ...erdSchema,
      tables: [
        {
          ...erdSchema.tables[0],
          indexes: [{ name: "idx_email", columnNames: ["email"], isUnique: false }],
        },
      ],
    };
    const report = {
      summary: { hasDrift: true },
      issues: [],
      diff: {
        tables: {
          removed: [],
          added: [],
          modified: [
            {
              name: "users",
              columns: { removed: [], added: [], modified: [] },
              indexes: {
                removed: [{ name: "idx_email", columnNames: ["email"], isUnique: false }],
                added: [],
                modified: [],
              },
              checkConstraints: { removed: [], added: [], modified: [] },
            },
          ],
        },
        relations: { added: [], removed: [], modified: [] },
      },
    };
    const result = generateMigrationSql(erdWithIndex, report, "mysql");
    expect(result.sql).toContain("CREATE INDEX `idx_email` ON `users`");
  });

  test("postgres uses double-quoted identifiers", () => {
    const report = {
      summary: { hasDrift: true },
      issues: [],
      diff: {
        tables: { removed: [{ name: "orders" }], added: [], modified: [] },
        relations: { added: [], removed: [], modified: [] },
      },
    };
    const result = generateMigrationSql(erdSchema, report, "postgres");
    expect(result.sql).toContain('CREATE TABLE "orders"');
  });
});
