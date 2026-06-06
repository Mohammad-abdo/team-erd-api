import mysql from "mysql2/promise";
import pg from "pg";
import { HttpError } from "../utils/httpError.js";
import { assertSafeMysqlHost } from "./ssrfGuard.js";

const { Client } = pg;

function mapRelationType(fromCols, toCols) {
  if (fromCols.length > 1 || toCols.length > 1) return "MANY_TO_MANY";
  return "ONE_TO_MANY";
}

function layoutPosition(index) {
  return {
    x: 48 + (index % 5) * 268,
    y: 48 + Math.floor(index / 5) * 320,
  };
}

function buildErdPayload(tableRows, columnsByTable, fkRows, mapColumn, meta) {
  const tables = tableRows.map((t, i) => {
    const cols = columnsByTable.get(t.name) ?? [];
    const { x, y } = layoutPosition(i);
    return {
      name: t.name,
      label: t.comment || null,
      description: t.comment || null,
      x,
      y,
      columns: cols.map((c, ci) => mapColumn(c, t.name, ci, fkRows)),
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
    meta: { ...meta, tableCount: tables.length, relationCount: relations.length },
  };
}

export function formatPgColumnType(col) {
  const {
    dataType,
    udtName,
    characterMaximumLength,
    numericPrecision,
    numericScale,
  } = col;

  if (dataType === "character varying" && characterMaximumLength) {
    return `varchar(${characterMaximumLength})`;
  }
  if (dataType === "character" && characterMaximumLength) {
    return `char(${characterMaximumLength})`;
  }
  if (dataType === "numeric" && numericPrecision != null) {
    return numericScale != null && Number(numericScale) > 0
      ? `numeric(${numericPrecision},${numericScale})`
      : `numeric(${numericPrecision})`;
  }

  if (udtName) {
    const udtMap = {
      int4: "integer",
      int8: "bigint",
      int2: "smallint",
      bool: "boolean",
      timestamptz: "timestamptz",
      timestamp: "timestamp",
      jsonb: "jsonb",
      json: "json",
      uuid: "uuid",
      text: "text",
      float4: "real",
      float8: "double precision",
    };
    return udtMap[udtName] ?? udtName;
  }

  return dataType;
}

function mapMysqlError(err) {
  if (err.code === "ECONNREFUSED") return "Could not connect to database server";
  if (err.code === "ER_ACCESS_DENIED_ERROR") {
    return "Database access denied — check credentials";
  }
  return err.message?.slice(0, 200) ?? "Introspection failed";
}

function mapPostgresError(err) {
  if (err.code === "ECONNREFUSED") return "Could not connect to database server";
  if (err.code === "28P01") return "Database access denied — check credentials";
  if (err.code === "3D000") return "Database does not exist";
  return err.message?.slice(0, 200) ?? "Introspection failed";
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

  await assertSafeMysqlHost(host);

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

    return buildErdPayload(
      tableRows,
      columnsByTable,
      fkRows,
      (c, tableName, ci, fks) => ({
        name: c.name,
        dataType: c.dataType,
        isPk: c.colKey === "PRI",
        isFk: c.colKey === "MUL" && fks.some(
          (fk) => fk.fromTable === tableName && fk.fromColumn === c.name,
        ),
        isNullable: c.nullable === "YES",
        isUnique: c.colKey === "UNI",
        defaultValue: c.defaultValue != null ? String(c.defaultValue) : null,
        description: c.comment || null,
        sortOrder: ci,
      }),
      { database: db, dialect: "mysql" },
    );
  } catch (err) {
    throw new HttpError(400, mapMysqlError(err));
  } finally {
    if (conn) {
      await conn.end().catch(() => {});
    }
  }
}

/**
 * Read PostgreSQL information_schema and return import-ready ERD payload.
 * Credentials are used only for this request — never stored.
 */
export async function introspectPostgresSchema({
  host,
  port = 5432,
  user,
  password,
  database,
  schema = "public",
}) {
  if (!host?.trim() || !user?.trim() || !database?.trim()) {
    throw new HttpError(400, "host, user, and database are required");
  }

  const schemaName = (schema?.trim() || "public").slice(0, 128);
  await assertSafeMysqlHost(host);

  let client;
  try {
    client = new Client({
      host: host.trim(),
      port: Number(port) || 5432,
      user: user.trim(),
      password: password ?? "",
      database: database.trim(),
      connectionTimeoutMillis: 10000,
    });
    await client.connect();

    const tableResult = await client.query(
      `SELECT
         t.table_name AS name,
         obj_description(
           (quote_ident(t.table_schema) || '.' || quote_ident(t.table_name))::regclass,
           'pg_class'
         ) AS comment
       FROM information_schema.tables t
       WHERE t.table_schema = $1 AND t.table_type = 'BASE TABLE'
       ORDER BY t.table_name`,
      [schemaName],
    );

    const columnResult = await client.query(
      `SELECT
         c.table_name AS "tableName",
         c.column_name AS name,
         c.data_type AS "dataType",
         c.udt_name AS "udtName",
         c.character_maximum_length AS "characterMaximumLength",
         c.numeric_precision AS "numericPrecision",
         c.numeric_scale AS "numericScale",
         c.is_nullable AS nullable,
         c.column_default AS "defaultValue",
         col_description(
           (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass,
           c.ordinal_position
         ) AS comment
       FROM information_schema.columns c
       WHERE c.table_schema = $1
       ORDER BY c.table_name, c.ordinal_position`,
      [schemaName],
    );

    const pkResult = await client.query(
      `SELECT kcu.table_name AS "tableName", kcu.column_name AS name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_schema = kcu.constraint_schema
        AND tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
       WHERE tc.table_schema = $1 AND tc.constraint_type = 'PRIMARY KEY'`,
      [schemaName],
    );

    const uniqueResult = await client.query(
      `SELECT kcu.table_name AS "tableName", kcu.column_name AS name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_schema = kcu.constraint_schema
        AND tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
       WHERE tc.table_schema = $1 AND tc.constraint_type = 'UNIQUE'`,
      [schemaName],
    );

    const fkResult = await client.query(
      `SELECT
         tc.table_name AS "fromTable",
         kcu.column_name AS "fromColumn",
         ccu.table_name AS "toTable",
         ccu.column_name AS "toColumn"
       FROM information_schema.table_constraints AS tc
       JOIN information_schema.key_column_usage AS kcu
         ON tc.constraint_schema = kcu.constraint_schema
        AND tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage AS ccu
         ON ccu.constraint_schema = tc.constraint_schema
        AND ccu.constraint_name = tc.constraint_name
       WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = $1
       ORDER BY tc.table_name, kcu.column_name`,
      [schemaName],
    );

    const pkSet = new Set(
      pkResult.rows.map((r) => `${r.tableName}:${r.name}`),
    );
    const uniqueSet = new Set(
      uniqueResult.rows.map((r) => `${r.tableName}:${r.name}`),
    );
    const fkRows = fkResult.rows;

    const columnsByTable = new Map();
    for (const col of columnResult.rows) {
      const list = columnsByTable.get(col.tableName) ?? [];
      list.push(col);
      columnsByTable.set(col.tableName, list);
    }

    return buildErdPayload(
      tableResult.rows,
      columnsByTable,
      fkRows,
      (c, tableName, ci, fks) => {
        const key = `${tableName}:${c.name}`;
        return {
          name: c.name,
          dataType: formatPgColumnType(c),
          isPk: pkSet.has(key),
          isFk: fks.some(
            (fk) => fk.fromTable === tableName && fk.fromColumn === c.name,
          ),
          isNullable: c.nullable === "YES",
          isUnique: uniqueSet.has(key) && !pkSet.has(key),
          defaultValue: c.defaultValue != null ? String(c.defaultValue) : null,
          description: c.comment || null,
          sortOrder: ci,
        };
      },
      {
        database: database.trim(),
        schema: schemaName,
        dialect: "postgres",
      },
    );
  } catch (err) {
    throw new HttpError(400, mapPostgresError(err));
  } finally {
    if (client) {
      await client.end().catch(() => {});
    }
  }
}
