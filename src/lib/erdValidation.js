const SNAKE_CASE = /^[a-z][a-z0-9_]*$/;

/**
 * Validate ERD tables and relations for structural issues and naming conventions.
 * @param {Array} tables - ERD tables with columns
 * @param {Array} relations - ERD relations
 */
export function validateErdSchema(tables, relations) {
  const issues = [];
  const tableById = new Map(tables.map((t) => [t.id, t]));

  const relationColumnIds = new Set();
  for (const rel of relations) {
    if (rel.fromColumnId) relationColumnIds.add(rel.fromColumnId);
    if (rel.toColumnId) relationColumnIds.add(rel.toColumnId);
  }

  for (const table of tables) {
    const cols = table.columns ?? [];
    const hasPk = cols.some((c) => c.isPk);

    if (cols.length > 0 && !hasPk) {
      issues.push({
        severity: "error",
        code: "MISSING_PK",
        tableId: table.id,
        tableName: table.name,
        message: `Table "${table.name}" has no primary key column`,
      });
    }

    if (!SNAKE_CASE.test(table.name)) {
      issues.push({
        severity: "warning",
        code: "TABLE_NAMING",
        tableId: table.id,
        tableName: table.name,
        message: `Table "${table.name}" should use snake_case lowercase (e.g. user_profiles)`,
      });
    }

    for (const col of cols) {
      if (!SNAKE_CASE.test(col.name)) {
        issues.push({
          severity: "warning",
          code: "COLUMN_NAMING",
          tableId: table.id,
          tableName: table.name,
          columnId: col.id,
          columnName: col.name,
          message: `Column "${table.name}.${col.name}" should use snake_case lowercase`,
        });
      }

      if (col.isFk && !relationColumnIds.has(col.id)) {
        issues.push({
          severity: "warning",
          code: "ORPHAN_FK_COLUMN",
          tableId: table.id,
          tableName: table.name,
          columnId: col.id,
          columnName: col.name,
          message: `Column "${table.name}.${col.name}" is marked as FK but has no relation`,
        });
      }
    }
  }

  for (const rel of relations) {
    const fromTable = tableById.get(rel.fromTableId);
    const toTable = tableById.get(rel.toTableId);

    if (!fromTable) {
      issues.push({
        severity: "error",
        code: "ORPHAN_RELATION",
        relationId: rel.id,
        message: `Relation references missing source table (id: ${rel.fromTableId})`,
      });
    }

    if (!toTable) {
      issues.push({
        severity: "error",
        code: "ORPHAN_RELATION",
        relationId: rel.id,
        message: `Relation references missing target table (id: ${rel.toTableId})`,
      });
    }

    if (rel.fromColumnId && fromTable) {
      const col = fromTable.columns?.find((c) => c.id === rel.fromColumnId);
      if (!col) {
        issues.push({
          severity: "error",
          code: "ORPHAN_FK",
          relationId: rel.id,
          tableName: fromTable.name,
          message: `Relation from "${fromTable.name}" references a missing column`,
        });
      }
    }

    if (rel.toColumnId && toTable) {
      const col = toTable.columns?.find((c) => c.id === rel.toColumnId);
      if (!col) {
        issues.push({
          severity: "error",
          code: "ORPHAN_FK",
          relationId: rel.id,
          tableName: toTable.name,
          message: `Relation to "${toTable.name}" references a missing column`,
        });
      }
    }
  }

  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;

  return { issues, summary: { errors, warnings, total: issues.length } };
}
