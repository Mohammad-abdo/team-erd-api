import mysql from "mysql2/promise";
import { HttpError } from "../utils/httpError.js";

function mapRelationType(fromCols, toCols) {
  if (fromCols.length > 1 || toCols.length > 1) return "MANY_TO_MANY";
  return "ONE_TO_MANY";
}

/**
 * Read MySQL INFORMATION_SCHEMA and return import-ready ERD payload.
 * Credentials are used only for this request — never stored.
 */
export async function introspectMysqlSchema({
  host,
  port = 3306,
  user,
  password,
  database,
}) {
  if (!host?.trim() || !user?.trim() || !database?.trim()) {
    throw new HttpError(400, "host, user, and database are required");
  }

  let conn;
  try {
    conn = await mysql.createConnection({
      host: host.trim(),
      port: Number(port) || 3306,
      user: user.trim(),
      password: password ?? "",
      database: database.trim(),
      connectTimeout: 10000,
    });

    const db = database.trim();

    const [tableRows] = await conn.query(
      `SELECT TABLE_NAME AS name, TABLE_COMMENT AS comment
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
       ORDER BY TABLE_NAME`,
      [db],
    );

    const [columnRows] = await conn.query(
      `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS name, COLUMN_TYPE AS dataType,
              IS_NULLABLE AS nullable, COLUMN_KEY AS colKey, COLUMN_DEFAULT AS defaultValue,
              EXTRA AS extra, COLUMN_COMMENT AS comment
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ?
       ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      [db],
    );

    const [fkRows] = await conn.query(
      `SELECT TABLE_NAME AS fromTable, COLUMN_NAME AS fromColumn,
              REFERENCED_TABLE_NAME AS toTable, REFERENCED_COLUMN_NAME AS toColumn
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL
       ORDER BY TABLE_NAME, COLUMN_NAME`,
      [db],
    );

    const columnsByTable = new Map();
    for (const col of columnRows) {
      const list = columnsByTable.get(col.tableName) ?? [];
      list.push(col);
      columnsByTable.set(col.tableName, list);
    }

    const tables = tableRows.map((t, i) => {
      const cols = columnsByTable.get(t.name) ?? [];
      return {
        name: t.name,
        label: t.comment || null,
        description: t.comment || null,
        x: 48 + (i % 5) * 268,
        y: 48 + Math.floor(i / 5) * 320,
        columns: cols.map((c, ci) => ({
          name: c.name,
          dataType: c.dataType,
          isPk: c.colKey === "PRI",
          isFk: c.colKey === "MUL" && fkRows.some(
            (fk) => fk.fromTable === t.name && fk.fromColumn === c.name,
          ),
          isNullable: c.nullable === "YES",
          isUnique: c.colKey === "UNI",
          defaultValue: c.defaultValue != null ? String(c.defaultValue) : null,
          description: c.comment || null,
          sortOrder: ci,
        })),
      };
    });

    const relations = fkRows.map((fk) => ({
      fromTable: fk.fromTable,
      toTable: fk.toTable,
      fromColumn: fk.fromColumn,
      toColumn: fk.toColumn,
      relationType: mapRelationType([fk.fromColumn], [fk.toColumn]),
      label: null,
    }));

    return {
      tables,
      relations,
      meta: { database: db, tableCount: tables.length, relationCount: relations.length },
    };
  } catch (err) {
    const msg = err.code === "ECONNREFUSED"
      ? "Could not connect to database server"
      : err.code === "ER_ACCESS_DENIED_ERROR"
        ? "Database access denied — check credentials"
        : err.message?.slice(0, 200) ?? "Introspection failed";
    throw new HttpError(400, msg);
  } finally {
    if (conn) {
      await conn.end().catch(() => {});
    }
  }
}
