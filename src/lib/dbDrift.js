import { diffErdSchemas } from "./erdSnapshotDiff.js";

export function normalizeDataType(type) {
  return String(type ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function normalizeIntrospectedTable(table) {
  return {
    name: table.name,
    label: table.label ?? null,
    color: null,
    groupName: null,
    description: table.description ?? null,
    columns: (table.columns ?? []).map((c) => ({
      name: c.name,
      dataType: c.dataType,
      isPk: Boolean(c.isPk),
      isFk: Boolean(c.isFk),
      isNullable: Boolean(c.isNullable),
      isUnique: Boolean(c.isUnique),
      defaultValue: c.defaultValue ?? null,
      description: c.description ?? null,
    })),
    indexes: [],
    checkConstraints: [],
  };
}

/** Normalize live DB introspection payload to snapshot-compatible shape. */
export function normalizeIntrospectedSchema({ tables = [], relations = [] }) {
  return {
    tables: tables.map(normalizeIntrospectedTable),
    relations: (relations ?? []).map((r) => ({
      fromTable: r.fromTable,
      toTable: r.toTable,
      fromColumn: r.fromColumn ?? null,
      toColumn: r.toColumn ?? null,
      relationType: r.relationType ?? "ONE_TO_MANY",
      label: r.label ?? null,
    })),
  };
}

function columnFieldLabel(field) {
  const labels = {
    dataType: "type",
    isPk: "primary key",
    isFk: "foreign key",
    isNullable: "nullable",
    isUnique: "unique",
    defaultValue: "default",
    description: "description",
  };
  return labels[field] ?? field;
}

function formatValue(field, value) {
  if (field === "dataType") return String(value ?? "—");
  if (typeof value === "boolean") return value ? "yes" : "no";
  return value == null || value === "" ? "—" : String(value);
}

/**
 * Compare whiteboard ERD (design) against live database schema (reality).
 * base = ERD, target = DB.
 */
export function detectDbDrift(erdSchema, dbSchema, meta = {}) {
  const erd = {
    tables: erdSchema?.tables ?? [],
    relations: erdSchema?.relations ?? [],
  };
  const db = normalizeIntrospectedSchema(dbSchema);
  const diff = diffErdSchemas(erd, db);

  const issues = [];

  for (const table of diff.tables.removed) {
    issues.push({
      severity: "error",
      category: "table",
      type: "missing_in_db",
      table: table.name,
      message: `Table "${table.name}" exists in ERD but is missing in the database`,
    });
  }

  for (const table of diff.tables.added) {
    issues.push({
      severity: "warning",
      category: "table",
      type: "extra_in_db",
      table: table.name,
      message: `Table "${table.name}" exists in the database but not in ERD`,
    });
  }

  for (const mod of diff.tables.modified) {
    for (const col of mod.columns.removed) {
      issues.push({
        severity: "error",
        category: "column",
        type: "missing_in_db",
        table: mod.name,
        column: col.name,
        erd: {
          dataType: col.dataType,
          isPk: col.isPk,
          isFk: col.isFk,
          isNullable: col.isNullable,
          isUnique: col.isUnique,
        },
        db: null,
        message: `Column "${mod.name}.${col.name}" is in ERD but missing in the database`,
      });
    }

    for (const col of mod.columns.added) {
      issues.push({
        severity: "warning",
        category: "column",
        type: "extra_in_db",
        table: mod.name,
        column: col.name,
        erd: null,
        db: {
          dataType: col.dataType,
          isPk: col.isPk,
          isFk: col.isFk,
          isNullable: col.isNullable,
          isUnique: col.isUnique,
        },
        message: `Column "${mod.name}.${col.name}" exists in the database but not in ERD`,
      });
    }

    for (const change of mod.columns.modified) {
      const typeChange = change.changes.find((c) => c.field === "dataType");
      const otherChanges = change.changes.filter((c) => c.field !== "dataType");

      if (typeChange) {
        const erdNorm = normalizeDataType(typeChange.before);
        const dbNorm = normalizeDataType(typeChange.after);
        if (erdNorm !== dbNorm) {
          issues.push({
            severity: "error",
            category: "column",
            type: "type_mismatch",
            table: mod.name,
            column: change.after.name,
            erd: { dataType: typeChange.before },
            db: { dataType: typeChange.after },
            message: `Column "${mod.name}.${change.after.name}" type mismatch: ERD ${typeChange.before} vs DB ${typeChange.after}`,
          });
        }
      }

      for (const ch of otherChanges) {
        issues.push({
          severity: ch.field === "isNullable" || ch.field === "isPk" ? "error" : "warning",
          category: "column",
          type: "column_mismatch",
          table: mod.name,
          column: change.after.name,
          field: ch.field,
          erd: { [ch.field]: ch.before },
          db: { [ch.field]: ch.after },
          message: `Column "${mod.name}.${change.after.name}" ${columnFieldLabel(ch.field)}: ERD ${formatValue(ch.field, ch.before)} vs DB ${formatValue(ch.field, ch.after)}`,
        });
      }
    }
  }

  for (const rel of diff.relations.removed) {
    issues.push({
      severity: "error",
      category: "relation",
      type: "missing_in_db",
      fromTable: rel.fromTable,
      toTable: rel.toTable,
      fromColumn: rel.fromColumn,
      toColumn: rel.toColumn,
      message: `Relation ${rel.fromTable}.${rel.fromColumn ?? "?"} → ${rel.toTable}.${rel.toColumn ?? "?"} is in ERD but missing in the database`,
    });
  }

  for (const rel of diff.relations.added) {
    issues.push({
      severity: "warning",
      category: "relation",
      type: "extra_in_db",
      fromTable: rel.fromTable,
      toTable: rel.toTable,
      fromColumn: rel.fromColumn,
      toColumn: rel.toColumn,
      message: `Relation ${rel.fromTable}.${rel.fromColumn ?? "?"} → ${rel.toTable}.${rel.toColumn ?? "?"} exists in the database but not in ERD`,
    });
  }

  for (const rel of diff.relations.modified) {
    issues.push({
      severity: "warning",
      category: "relation",
      type: "relation_mismatch",
      fromTable: rel.after.fromTable,
      toTable: rel.after.toTable,
      fromColumn: rel.after.fromColumn,
      toColumn: rel.after.toColumn,
      changes: rel.changes,
      message: `Relation ${rel.after.fromTable} → ${rel.after.toTable} differs between ERD and database`,
    });
  }

  const missingInDb = issues.filter((i) => i.type === "missing_in_db" || i.type === "type_mismatch" || (i.type === "column_mismatch" && i.severity === "error")).length;
  const extraInDb = issues.filter((i) => i.type === "extra_in_db").length;
  const modified = issues.filter((i) => i.type === "column_mismatch" || i.type === "relation_mismatch").length;

  const summary = {
    hasDrift: issues.length > 0,
    inSync: issues.length === 0,
    issueCount: issues.length,
    missingInDb,
    extraInDb,
    modified,
    erdTables: erd.tables.length,
    dbTables: db.tables.length,
    erdRelations: erd.relations.length,
    dbRelations: db.relations.length,
    ...diff.summary,
  };

  return {
    summary,
    issues,
    diff,
    meta,
  };
}
