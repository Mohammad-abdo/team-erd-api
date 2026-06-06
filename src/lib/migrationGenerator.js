import { normalizeDataType } from "./dbDrift.js";

function escapeIdent(name, dialect) {
  const s = String(name).replace(/"/g, '""');
  return dialect === "postgres" ? `"${s}"` : `\`${s.replace(/`/g, "``")}\``;
}

function formatDefault(value, dialect) {
  if (value == null || value === "") return null;
  const v = String(value).trim();
  if (/^(null|true|false|\d+(\.\d+)?)$/i.test(v)) return v;
  if (v.startsWith("'") || v.startsWith('"')) return v;
  return dialect === "postgres" ? `'${v.replace(/'/g, "''")}'` : `'${v.replace(/'/g, "''")}'`;
}

function formatColumnDef(col, dialect, { forAlter = false } = {}) {
  const parts = [escapeIdent(col.name, dialect), col.dataType];
  if (!col.isNullable && !col.isPk) {
    parts.push("NOT NULL");
  }
  if (col.isUnique && !col.isPk && !forAlter) {
    parts.push("UNIQUE");
  }
  const def = formatDefault(col.defaultValue, dialect);
  if (def) {
    parts.push(`DEFAULT ${def}`);
  }
  return parts.join(" ");
}

function findErdTable(erdSchema, tableName) {
  const key = String(tableName ?? "").trim().toLowerCase();
  return (erdSchema?.tables ?? []).find((t) => t.name.toLowerCase() === key);
}

function parseColumnNames(columnNames) {
  if (!Array.isArray(columnNames)) return [];
  return columnNames.filter((c) => typeof c === "string" && c.trim() !== "");
}

function generateCreateIndex(tableName, idx, dialect) {
  const cols = parseColumnNames(idx.columnNames).map((c) => escapeIdent(c, dialect));
  if (!cols.length) return null;
  const t = escapeIdent(tableName, dialect);
  const idxName = escapeIdent(idx.name || `idx_${tableName}`, dialect);
  const unique = idx.isUnique ? "UNIQUE " : "";
  return `CREATE ${unique}INDEX ${idxName} ON ${t} (${cols.join(", ")});`;
}

function generateAddCheckConstraint(tableName, chk, dialect) {
  const t = escapeIdent(tableName, dialect);
  const cName = escapeIdent(chk.name || `chk_${tableName}`, dialect);
  return `ALTER TABLE ${t} ADD CONSTRAINT ${cName} CHECK (${chk.expression});`;
}

function generateCreateTable(table, dialect) {
  const tableName = escapeIdent(table.name, dialect);
  const colDefs = (table.columns ?? []).map((c) => `  ${formatColumnDef(c, dialect)}`);

  const pkCols = (table.columns ?? []).filter((c) => c.isPk).map((c) => escapeIdent(c.name, dialect));
  if (pkCols.length) {
    colDefs.push(`  PRIMARY KEY (${pkCols.join(", ")})`);
  }

  for (const chk of table.checkConstraints ?? []) {
    const cName = escapeIdent(chk.name || `chk_${table.name}`, dialect);
    colDefs.push(`  CONSTRAINT ${cName} CHECK (${chk.expression})`);
  }

  const body = colDefs.length ? `${colDefs.join(",\n")}` : "";
  return `CREATE TABLE ${tableName} (\n${body}\n);`;
}

function appendTableIndexes(statements, tableName, table, dialect) {
  for (const idx of table.indexes ?? []) {
    const sql = generateCreateIndex(tableName, idx, dialect);
    if (sql) {
      statements.push({ kind: "create_index", table: tableName, sql });
    }
  }
}

function generateAddColumn(tableName, col, dialect) {
  const t = escapeIdent(tableName, dialect);
  const def = formatColumnDef(col, dialect, { forAlter: true });
  return `ALTER TABLE ${t} ADD COLUMN ${def};`;
}

function generateModifyColumn(tableName, col, dialect, changes) {
  const t = escapeIdent(tableName, dialect);
  const stmts = [];

  if (dialect === "postgres") {
    const typeChange = changes?.find((c) => c.field === "dataType");
    if (typeChange) {
      stmts.push(
        `ALTER TABLE ${t} ALTER COLUMN ${escapeIdent(col.name, dialect)} TYPE ${typeChange.after};`,
      );
    }
    const nullChange = changes?.find((c) => c.field === "isNullable");
    if (nullChange) {
      stmts.push(
        nullChange.after
          ? `ALTER TABLE ${t} ALTER COLUMN ${escapeIdent(col.name, dialect)} DROP NOT NULL;`
          : `ALTER TABLE ${t} ALTER COLUMN ${escapeIdent(col.name, dialect)} SET NOT NULL;`,
      );
    }
    const uniqueChange = changes?.find((c) => c.field === "isUnique");
    if (uniqueChange?.after && !col.isPk) {
      stmts.push(
        `CREATE UNIQUE INDEX ${escapeIdent(`uq_${tableName}_${col.name}`, dialect)} ON ${t} (${escapeIdent(col.name, dialect)});`,
      );
    }
    if (!stmts.length) {
      stmts.push(`-- Review column "${tableName}.${col.name}" manually (PostgreSQL)`);
    }
    return stmts;
  }

  // MySQL — single MODIFY covers type + nullability
  const parts = [escapeIdent(col.name, dialect), col.dataType];
  if (!col.isNullable) parts.push("NOT NULL");
  else parts.push("NULL");
  if (col.defaultValue != null && col.defaultValue !== "") {
    const def = formatDefault(col.defaultValue, dialect);
    if (def) parts.push(`DEFAULT ${def}`);
  }
  stmts.push(`ALTER TABLE ${t} MODIFY COLUMN ${parts.join(" ")};`);
  return stmts;
}

function generateAddForeignKey(rel, dialect) {
  const from = escapeIdent(rel.fromTable, dialect);
  const to = escapeIdent(rel.toTable, dialect);
  const fromCol = escapeIdent(rel.fromColumn ?? "id", dialect);
  const toCol = escapeIdent(rel.toColumn ?? "id", dialect);
  const cName = escapeIdent(`fk_${rel.fromTable}_${rel.fromColumn ?? "ref"}`, dialect);
  return `ALTER TABLE ${from} ADD CONSTRAINT ${cName} FOREIGN KEY (${fromCol}) REFERENCES ${to} (${toCol});`;
}

function generateOptionalDropComments(report, dialect) {
  const lines = [];
  const issues = report?.issues ?? [];

  const extraTables = issues.filter((i) => i.category === "table" && i.type === "extra_in_db");
  const extraCols = issues.filter((i) => i.category === "column" && i.type === "extra_in_db");
  const extraRels = issues.filter((i) => i.category === "relation" && i.type === "extra_in_db");

  if (!extraTables.length && !extraCols.length && !extraRels.length) return lines;

  lines.push("-- ── Optional: remove extras from DB (review before running) ──");
  for (const i of extraTables) {
    lines.push(`-- DROP TABLE ${escapeIdent(i.table, dialect)};`);
  }
  for (const i of extraCols) {
    lines.push(`-- ALTER TABLE ${escapeIdent(i.table, dialect)} DROP COLUMN ${escapeIdent(i.column, dialect)};`);
  }
  for (const i of extraRels) {
    lines.push(
      `-- DROP FK ${i.fromTable}.${i.fromColumn} → ${i.toTable}.${i.toColumn} (find constraint name in DB)`,
    );
  }
  return lines;
}

/**
 * Generate SQL to align live database with whiteboard ERD (ERD → DB).
 * Destructive drops are emitted only as commented suggestions.
 */
export function generateMigrationSql(erdSchema, report, dialect = "mysql") {
  if (!report?.summary?.hasDrift) {
    return {
      dialect,
      statementCount: 0,
      sql: "-- Schemas are in sync — no migration needed.\n",
      statements: [],
    };
  }

  const statements = [];
  const diff = report.diff;
  const erdTableMap = new Map(
    (erdSchema?.tables ?? []).map((t) => [t.name.toLowerCase(), t]),
  );

  // 1. Create missing tables (full ERD definition)
  for (const { name } of diff?.tables?.removed ?? []) {
    const table = findErdTable(erdSchema, name);
    if (table) {
      statements.push({ kind: "create_table", table: name, sql: generateCreateTable(table, dialect) });
      appendTableIndexes(statements, name, table, dialect);
    }
  }

  // 2. Add missing columns + modify existing columns on tables that exist in both
  for (const mod of diff?.tables?.modified ?? []) {
    const erdTable = erdTableMap.get(mod.name.toLowerCase());
    if (!erdTable) continue;

    for (const idx of mod.indexes?.removed ?? []) {
      const sql = generateCreateIndex(mod.name, idx, dialect);
      if (sql) {
        statements.push({ kind: "create_index", table: mod.name, sql });
      }
    }

    for (const chk of mod.checkConstraints?.removed ?? []) {
      statements.push({
        kind: "add_check",
        table: mod.name,
        sql: generateAddCheckConstraint(mod.name, chk, dialect),
      });
    }

    for (const col of mod.columns?.removed ?? []) {
      statements.push({
        kind: "add_column",
        table: mod.name,
        column: col.name,
        sql: generateAddColumn(mod.name, col, dialect),
      });
    }

    for (const change of mod.columns?.modified ?? []) {
      const erdCol = (erdTable.columns ?? []).find(
        (c) => c.name.toLowerCase() === change.after.name.toLowerCase(),
      );
      if (!erdCol) continue;

      const hasRealChange = change.changes.some((ch) => {
        if (ch.field === "dataType") {
          return normalizeDataType(ch.before) !== normalizeDataType(ch.after);
        }
        return JSON.stringify(ch.before) !== JSON.stringify(ch.after);
      });
      if (!hasRealChange) continue;

      const sqls = generateModifyColumn(mod.name, erdCol, dialect, change.changes);
      for (const sql of sqls) {
        statements.push({
          kind: "modify_column",
          table: mod.name,
          column: erdCol.name,
          sql,
        });
      }
    }
  }

  // 3. Foreign keys missing in DB
  for (const rel of diff?.relations?.removed ?? []) {
    if (!rel.fromColumn || !rel.toColumn) continue;
    statements.push({
      kind: "add_foreign_key",
      fromTable: rel.fromTable,
      toTable: rel.toTable,
      sql: generateAddForeignKey(rel, dialect),
    });
  }

  const header = [
    `-- Generated by DBForge — align database with whiteboard ERD`,
    `-- Dialect: ${dialect}`,
    `-- Review and run on staging before production.`,
    "",
  ];

  const body = statements.map((s) => s.sql);
  const optional = generateOptionalDropComments(report, dialect);
  const sql = [...header, ...body, ...(optional.length ? ["", ...optional] : []), ""].join("\n");

  return {
    dialect,
    statementCount: statements.length,
    sql,
    statements,
    hasOptionalDrops: optional.length > 0,
  };
}
