import { config } from "../../config/index.js";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import * as apiDocsService from "../apiDocs/apiDocs.service.js";

const SYSTEM_PROMPT = `You are a database architect. Given an app description, output ONLY valid JSON:
{
  "tables": [
    {
      "name": "snake_case_table",
      "label": "Human Name",
      "description": "optional",
      "columns": [
        { "name": "id", "dataType": "varchar(36)", "isPk": true, "isNullable": false, "isUnique": true }
      ]
    }
  ],
  "relations": [
    { "fromTable": "posts", "toTable": "users", "fromColumn": "user_id", "toColumn": "id", "relationType": "ONE_TO_MANY" }
  ]
}
Use snake_case. Include id PKs. relationType is ONE_TO_ONE, ONE_TO_MANY, or MANY_TO_MANY. No markdown.`;

function normalizeSchema(raw) {
  if (!raw?.tables?.length) {
    throw new HttpError(422, "AI returned no tables");
  }
  return {
    tables: raw.tables.map((t, i) => ({
      name: String(t.name).trim(),
      label: t.label?.trim() || null,
      description: t.description?.trim() || null,
      x: 48 + (i % 5) * 268,
      y: 48 + Math.floor(i / 5) * 320,
      columns: (t.columns ?? []).map((c, ci) => ({
        name: String(c.name).trim(),
        dataType: c.dataType?.trim() || "varchar(255)",
        isPk: Boolean(c.isPk),
        isFk: Boolean(c.isFk),
        isNullable: c.isNullable !== false,
        isUnique: Boolean(c.isUnique),
        defaultValue: c.defaultValue ?? null,
        description: c.description?.trim() || null,
        sortOrder: ci,
      })),
    })),
    relations: (raw.relations ?? []).map((r) => ({
      fromTable: r.fromTable,
      toTable: r.toTable,
      fromColumn: r.fromColumn ?? null,
      toColumn: r.toColumn ?? null,
      relationType: r.relationType ?? "ONE_TO_MANY",
      label: r.label ?? null,
    })),
  };
}

/** Rule-based fallback when OPENAI_API_KEY is not set (dev / offline). */
function generateHeuristic(description) {
  const text = description.toLowerCase();
  const tables = [];
  const relations = [];

  function addTable(name, label, columns, extra = {}) {
    tables.push({
      name,
      label,
      description: extra.description ?? null,
      x: 48 + (tables.length % 5) * 268,
      y: 48 + Math.floor(tables.length / 5) * 320,
      columns,
    });
  }

  const idCol = (name = "id") => ({
    name,
    dataType: "varchar(36)",
    isPk: true,
    isFk: false,
    isNullable: false,
    isUnique: true,
  });

  const fkCol = (name, refTable) => ({
    name,
    dataType: "varchar(36)",
    isPk: false,
    isFk: true,
    isNullable: false,
    isUnique: false,
  });

  const str = (name, len = 255) => ({
    name,
    dataType: `varchar(${len})`,
    isPk: false,
    isFk: false,
    isNullable: true,
    isUnique: false,
  });

  const needsUsers =
    text.includes("user") ||
    text.includes("auth") ||
    text.includes("login") ||
    text.includes("member") ||
    text.includes("account");

  if (needsUsers || text.includes("blog") || text.includes("shop") || text.includes("ecommerce") || text.includes("e-commerce")) {
    addTable("users", "Users", [
      idCol(),
      str("email", 255),
      str("name", 120),
      str("password_hash", 255),
      { name: "created_at", dataType: "datetime", isPk: false, isFk: false, isNullable: false, isUnique: false },
    ]);
  }

  if (text.includes("blog") || text.includes("post") || text.includes("article")) {
    addTable("posts", "Posts", [
      idCol(),
      fkCol("user_id", "users"),
      str("title", 200),
      { name: "body", dataType: "text", isPk: false, isFk: false, isNullable: true, isUnique: false },
      { name: "published_at", dataType: "datetime", isPk: false, isFk: false, isNullable: true, isUnique: false },
    ]);
    if (tables.some((t) => t.name === "users")) {
      relations.push({
        fromTable: "posts",
        toTable: "users",
        fromColumn: "user_id",
        toColumn: "id",
        relationType: "ONE_TO_MANY",
      });
    }
  }

  if (text.includes("comment")) {
    addTable("comments", "Comments", [
      idCol(),
      fkCol("user_id", "users"),
      fkCol("post_id", "posts"),
      { name: "body", dataType: "text", isPk: false, isFk: false, isNullable: false, isUnique: false },
      { name: "created_at", dataType: "datetime", isPk: false, isFk: false, isNullable: false, isUnique: false },
    ]);
    if (tables.some((t) => t.name === "users")) {
      relations.push({
        fromTable: "comments",
        toTable: "users",
        fromColumn: "user_id",
        toColumn: "id",
        relationType: "ONE_TO_MANY",
      });
    }
    if (tables.some((t) => t.name === "posts")) {
      relations.push({
        fromTable: "comments",
        toTable: "posts",
        fromColumn: "post_id",
        toColumn: "id",
        relationType: "ONE_TO_MANY",
      });
    }
  }

  if (text.includes("product") || text.includes("shop") || text.includes("ecommerce") || text.includes("e-commerce") || text.includes("inventory")) {
    addTable("products", "Products", [
      idCol(),
      str("sku", 64),
      str("name", 200),
      { name: "price", dataType: "decimal(10,2)", isPk: false, isFk: false, isNullable: false, isUnique: false },
      { name: "stock", dataType: "int", isPk: false, isFk: false, isNullable: false, isUnique: false },
    ]);
  }

  if (text.includes("order") || text.includes("checkout") || text.includes("cart")) {
    addTable("orders", "Orders", [
      idCol(),
      fkCol("user_id", "users"),
      { name: "total", dataType: "decimal(10,2)", isPk: false, isFk: false, isNullable: false, isUnique: false },
      str("status", 32),
      { name: "created_at", dataType: "datetime", isPk: false, isFk: false, isNullable: false, isUnique: false },
    ]);
    addTable("order_items", "Order Items", [
      idCol(),
      fkCol("order_id", "orders"),
      fkCol("product_id", "products"),
      { name: "quantity", dataType: "int", isPk: false, isFk: false, isNullable: false, isUnique: false },
      { name: "unit_price", dataType: "decimal(10,2)", isPk: false, isFk: false, isNullable: false, isUnique: false },
    ]);
    relations.push(
      { fromTable: "orders", toTable: "users", fromColumn: "user_id", toColumn: "id", relationType: "ONE_TO_MANY" },
      { fromTable: "order_items", toTable: "orders", fromColumn: "order_id", toColumn: "id", relationType: "ONE_TO_MANY" },
      { fromTable: "order_items", toTable: "products", fromColumn: "product_id", toColumn: "id", relationType: "ONE_TO_MANY" },
    );
  }

  if (text.includes("team") || text.includes("organization") || text.includes("company")) {
    addTable("teams", "Teams", [idCol(), str("name", 120), str("slug", 120)]);
    addTable("team_members", "Team Members", [
      idCol(),
      fkCol("team_id", "teams"),
      fkCol("user_id", "users"),
      str("role", 32),
    ]);
    relations.push(
      { fromTable: "team_members", toTable: "teams", fromColumn: "team_id", toColumn: "id", relationType: "ONE_TO_MANY" },
      { fromTable: "team_members", toTable: "users", fromColumn: "user_id", toColumn: "id", relationType: "ONE_TO_MANY" },
    );
  }

  if (tables.length === 0) {
    addTable("entities", "Entities", [
      idCol(),
      str("name", 200),
      { name: "created_at", dataType: "datetime", isPk: false, isFk: false, isNullable: false, isUnique: false },
    ]);
  }

  return { tables, relations, source: "heuristic" };
}

async function generateWithOpenAI(description) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openai.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.openai.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: description.trim() },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new HttpError(502, `AI provider error: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new HttpError(502, "Empty AI response");
  }

  const parsed = JSON.parse(content);
  const schema = normalizeSchema(parsed);
  return { ...schema, source: "openai" };
}

export async function generateSchemaFromDescription(description) {
  const trimmed = description?.trim();
  if (!trimmed || trimmed.length < 10) {
    throw new HttpError(400, "Description must be at least 10 characters");
  }
  if (trimmed.length > 4000) {
    throw new HttpError(400, "Description too long (max 4000 characters)");
  }

  if (config.openai.apiKey) {
    try {
      return await generateWithOpenAI(trimmed);
    } catch (err) {
      if (err instanceof HttpError) throw err;
      return { ...generateHeuristic(trimmed), source: "heuristic_fallback" };
    }
  }

  return generateHeuristic(trimmed);
}

const DRIFT_EXPLAIN_SYSTEM = `You are a senior database engineer explaining schema drift to a developer.
Given a drift report and optional migration SQL, write a concise plain-language summary (markdown OK).
Cover: what differs, risk level, recommended order to apply changes, and what to verify after migration.
Do not invent issues not in the report. Max 400 words.`;

export function explainDriftHeuristic(report) {
  const summary = report.summary ?? {};
  if (summary.inSync) {
    return {
      explanation: "Your whiteboard schema matches the live database. No migration is required.",
      source: "heuristic",
    };
  }

  const issues = report.issues ?? [];
  const dbLabel = report.meta?.schema
    ? `${report.meta.database}.${report.meta.schema}`
    : report.meta?.database ?? "the database";
  const lines = [
    `**Overview:** ${summary.issueCount ?? issues.length} difference(s) between your ERD and ${dbLabel}.`,
  ];

  const missing = issues.filter((i) => i.type === "missing_in_db");
  const extra = issues.filter((i) => i.type === "extra_in_db");
  const modified = issues.filter(
    (i) => i.type !== "missing_in_db" && i.type !== "extra_in_db",
  );

  if (missing.length) {
    lines.push(
      `\n**Missing in database (${missing.length}):** Objects defined on the whiteboard but absent in the live DB. Migration SQL will CREATE tables/columns or add constraints.`,
    );
    missing.slice(0, 6).forEach((i) => lines.push(`- ${i.message}`));
    if (missing.length > 6) lines.push(`- …and ${missing.length - 6} more`);
  }

  if (modified.length) {
    lines.push(
      `\n**Modified (${modified.length}):** Type, nullability, or constraint differences. Review each ALTER carefully — data loss is possible.`,
    );
    modified.slice(0, 4).forEach((i) => lines.push(`- ${i.message}`));
  }

  if (extra.length) {
    lines.push(
      `\n**Extra in database (${extra.length}):** Present in the live DB but not in your ERD. Optional DROP statements may appear commented at the bottom of the migration — do not run without review.`,
    );
  }

  if (report.migration?.statementCount) {
    lines.push(
      `\n**Suggested migration:** ${report.migration.statementCount} SQL statement(s) for ${report.migration.dialect ?? report.meta?.dialect ?? "SQL"}. Test on staging first, then apply during a maintenance window.`,
    );
  }

  lines.push("\n**Next steps:** Back up the database, run the migration on a copy, verify app queries, then update production.");

  return { explanation: lines.join("\n"), source: "heuristic" };
}

async function explainDriftWithOpenAI(report) {
  const payload = {
    summary: report.summary,
    meta: report.meta,
    issues: (report.issues ?? []).slice(0, 25).map((i) => ({
      type: i.type,
      message: i.message,
      table: i.table,
      column: i.column,
    })),
    migrationPreview: report.migration?.sql?.slice(0, 6000) ?? null,
    statementCount: report.migration?.statementCount ?? 0,
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openai.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.openai.model,
      temperature: 0.3,
      messages: [
        { role: "system", content: DRIFT_EXPLAIN_SYSTEM },
        { role: "user", content: JSON.stringify(payload) },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new HttpError(502, `AI provider error: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new HttpError(502, "Empty AI response");
  }

  return { explanation: content, source: "openai" };
}

export async function explainDriftReport(report) {
  if (!report?.summary) {
    throw new HttpError(400, "Drift report summary is required");
  }

  if (config.openai.apiKey && !report.summary.inSync) {
    try {
      return await explainDriftWithOpenAI(report);
    } catch (err) {
      if (err instanceof HttpError && err.status !== 502) throw err;
      return explainDriftHeuristic(report);
    }
  }

  return explainDriftHeuristic(report);
}

const API_SUGGEST_SYSTEM = `You suggest REST API routes from an ERD. Output ONLY valid JSON:
{
  "group": { "name": "Resource API", "prefix": "/api/v1", "description": "optional" },
  "routes": [
    { "method": "GET", "path": "/users", "summary": "List users", "erdTableName": "users" }
  ]
}
Use standard REST verbs (GET, POST, PUT, PATCH, DELETE). Paths are relative to group prefix. erdTableName must match an input table name.`;

const CRUD_METHODS = [
  { method: "GET", suffix: "", summary: (label) => `List ${label}` },
  { method: "GET", suffix: "/:id", summary: (label) => `Get ${label} by ID` },
  { method: "POST", suffix: "", summary: (label) => `Create ${label}` },
  { method: "PUT", suffix: "/:id", summary: (label) => `Update ${label}` },
  { method: "DELETE", suffix: "/:id", summary: (label) => `Delete ${label}` },
];

export function suggestApiRoutesHeuristic(tables) {
  const routes = [];
  for (const table of tables) {
    const label = table.label ?? table.name;
    const base = `/${table.name}`;
    for (const tpl of CRUD_METHODS) {
      routes.push({
        method: tpl.method,
        path: `${base}${tpl.suffix}`,
        summary: tpl.summary(label),
        erdTableId: table.id,
        erdTableName: table.name,
      });
    }
  }

  return {
    group: {
      name: "ERD CRUD (suggested)",
      prefix: "/api/v1",
      description: "Auto-generated REST routes from whiteboard tables",
    },
    routes,
    source: "heuristic",
  };
}

async function suggestApiRoutesWithOpenAI(tables) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openai.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.openai.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: API_SUGGEST_SYSTEM },
        {
          role: "user",
          content: JSON.stringify({
            tables: tables.map((t) => ({
              name: t.name,
              label: t.label,
              columns: (t.columns ?? []).slice(0, 12).map((c) => c.name),
            })),
          }),
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new HttpError(502, `AI provider error: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new HttpError(502, "Empty AI response");
  }

  const parsed = JSON.parse(content);
  const nameToId = new Map(tables.map((t) => [t.name, t.id]));
  const routes = (parsed.routes ?? []).map((r) => ({
    method: String(r.method ?? "GET").toUpperCase(),
    path: String(r.path ?? "/").trim(),
    summary: r.summary?.trim() ?? null,
    erdTableId: nameToId.get(r.erdTableName) ?? null,
    erdTableName: r.erdTableName ?? null,
  }));

  return {
    group: {
      name: parsed.group?.name?.trim() || "AI suggested routes",
      prefix: parsed.group?.prefix?.trim() || "/api/v1",
      description: parsed.group?.description?.trim() ?? null,
    },
    routes,
    source: "openai",
  };
}

export async function suggestApiRoutesFromErd(projectId) {
  const tables = await prisma.erdTable.findMany({
    where: { projectId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      label: true,
      columns: { select: { name: true }, take: 20 },
    },
  });

  if (!tables.length) {
    throw new HttpError(400, "Add ERD tables on the whiteboard first");
  }

  if (config.openai.apiKey) {
    try {
      return await suggestApiRoutesWithOpenAI(tables);
    } catch {
      return suggestApiRoutesHeuristic(tables);
    }
  }

  return suggestApiRoutesHeuristic(tables);
}

export async function applySuggestedApiRoutes(projectId, userId, payload) {
  if (!payload?.group?.name || !payload.routes?.length) {
    throw new HttpError(400, "Suggested group and routes are required");
  }

  const group = await apiDocsService.createGroup(projectId, userId, payload.group);
  let routesCreated = 0;

  for (const r of payload.routes) {
    const route = await apiDocsService.createRoute(projectId, userId, group.id, {
      method: r.method,
      path: r.path,
      summary: r.summary,
      authRequired: true,
    });
    if (r.erdTableId) {
      await apiDocsService.setRouteErdLinks(projectId, userId, route.id, [r.erdTableId]);
    }
    routesCreated += 1;
  }

  return {
    groupId: group.id,
    routesCreated,
    source: payload.source ?? "heuristic",
  };
}
