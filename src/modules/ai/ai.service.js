import { config } from "../../config/index.js";
import { HttpError } from "../../utils/httpError.js";

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
