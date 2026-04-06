import { prisma } from "../../lib/prisma.js";

/* ── helpers ── */
function prismaParamLocationToOpenApi(loc) {
  const map = { QUERY: "query", HEADER: "header", PATH: "path", BODY: "requestBody" };
  return map[loc] ?? "query";
}
function methodLower(m) { return (m ?? "get").toLowerCase(); }

function escapeIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

export async function exportErdSql(projectId) {
  const tables = await prisma.erdTable.findMany({
    where: { projectId },
    include: { columns: { orderBy: { sortOrder: "asc" } } },
    orderBy: { name: "asc" },
  });

  const lines = [];
  for (const t of tables) {
    const tableName = escapeIdent(t.name);
    lines.push(`CREATE TABLE ${tableName} (`);
    const colDefs = t.columns.map((c) => {
      const parts = [escapeIdent(c.name), c.dataType];
      if (!c.isNullable) {
        parts.push("NOT NULL");
      }
      if (c.isUnique && !c.isPk) {
        parts.push("UNIQUE");
      }
      return `  ${parts.join(" ")}`;
    });
    const pkCols = t.columns.filter((c) => c.isPk).map((c) => escapeIdent(c.name));
    if (pkCols.length) {
      colDefs.push(`  PRIMARY KEY (${pkCols.join(", ")})`);
    }
    lines.push(colDefs.length ? `${colDefs.join(",\n")}\n);` : `);`);
    lines.push("");
  }

  return lines.join("\n");
}

export async function exportErdJson(projectId) {
  const [tables, relations, groups] = await Promise.all([
    prisma.erdTable.findMany({
      where: { projectId },
      orderBy: { name: "asc" },
      include: { columns: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.erdRelation.findMany({ where: { projectId } }),
    prisma.apiGroup.findMany({
      where: { projectId },
      orderBy: { sortOrder: "asc" },
      include: {
        routes: {
          orderBy: { path: "asc" },
          include: { parameters: true, responses: true },
        },
      },
    }),
  ]);

  return {
    version: 1,
    projectId,
    erd: { tables, relations },
    api: { groups },
  };
}

/* ── OpenAPI 3.0 (Swagger) export ─────────────────────────────────────── */
export async function exportSwagger(projectId) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, description: true },
  });

  const groups = await prisma.apiGroup.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" },
    include: {
      routes: {
        orderBy: { path: "asc" },
        include: { parameters: true, responses: true },
      },
    },
  });

  const paths = {};
  const tags = [];

  for (const g of groups) {
    tags.push({ name: g.name, description: g.description ?? "" });
    for (const route of g.routes) {
      const fullPath = ((g.prefix ?? "") + route.path).replace(/\/+/g, "/") || "/";
      if (!paths[fullPath]) paths[fullPath] = {};

      const bodyParams = route.parameters.filter(p => p.location === "BODY");
      const otherParams = route.parameters.filter(p => p.location !== "BODY");

      const op = {
        tags: [g.name],
        summary: route.summary ?? route.path,
        description: route.description ?? "",
        operationId: `${methodLower(route.method)}_${fullPath.replace(/[^a-zA-Z0-9]/g, "_")}`,
        parameters: otherParams.map(p => ({
          name: p.name,
          in: prismaParamLocationToOpenApi(p.location),
          required: p.isRequired ?? false,
          description: p.description ?? "",
          schema: { type: p.dataType ?? "string" },
          example: p.example ?? undefined,
        })),
        responses: {},
      };

      if (route.authRequired) {
        op.security = [{ bearerAuth: [] }];
      }

      if (bodyParams.length) {
        const properties = {};
        const required = [];
        for (const p of bodyParams) {
          properties[p.name] = { type: p.dataType ?? "string", description: p.description ?? "", example: p.example ?? undefined };
          if (p.isRequired) required.push(p.name);
        }
        op.requestBody = {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", properties, ...(required.length ? { required } : {}) },
            },
          },
        };
      }

      for (const res of route.responses) {
        const code = String(res.statusCode);
        op.responses[code] = {
          description: res.description ?? `HTTP ${code}`,
          ...(res.exampleJson ? {
            content: {
              "application/json": {
                example: (() => { try { return JSON.parse(res.exampleJson); } catch { return res.exampleJson; } })(),
              },
            },
          } : {}),
        };
      }
      if (!Object.keys(op.responses).length) op.responses["200"] = { description: "Success" };

      paths[fullPath][methodLower(route.method)] = op;
    }
  }

  return {
    openapi: "3.0.3",
    info: {
      title: project?.name ?? "API",
      description: project?.description ?? "",
      version: "1.0.0",
    },
    tags,
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
    },
  };
}

/* ── Postman Collection v2.1 export ───────────────────────────────────── */
export async function exportPostman(projectId) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, description: true },
  });

  const groups = await prisma.apiGroup.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" },
    include: {
      routes: {
        orderBy: { path: "asc" },
        include: { parameters: true, responses: true },
      },
    },
  });

  const folders = groups.map(g => ({
    name: g.name,
    description: g.description ?? "",
    item: g.routes.map(route => {
      const fullPath = ((g.prefix ?? "") + route.path).replace(/\/+/g, "/") || "/";
      const queryParams = route.parameters.filter(p => p.location === "QUERY");
      const headerParams = route.parameters.filter(p => p.location === "HEADER");
      const bodyParams = route.parameters.filter(p => p.location === "BODY");

      const urlParts = fullPath.replace(/^\//, "").split("/");
      const pathVars = urlParts
        .filter(p => p.startsWith(":") || (p.startsWith("{") && p.endsWith("}")))
        .map(p => ({ key: p.replace(/[:{}]/g, ""), value: "", description: "" }));

      const item = {
        name: `${route.method} ${fullPath}`,
        request: {
          method: route.method,
          header: [
            { key: "Content-Type", value: "application/json" },
            ...(route.authRequired ? [{ key: "Authorization", value: "Bearer {{token}}", type: "text" }] : []),
            ...headerParams.map(p => ({ key: p.name, value: p.example ?? "", description: p.description ?? "" })),
          ],
          url: {
            raw: `{{baseUrl}}${fullPath}`,
            host: ["{{baseUrl}}"],
            path: urlParts,
            query: queryParams.map(p => ({ key: p.name, value: p.example ?? "", description: p.description ?? "", disabled: !p.isRequired })),
            variable: pathVars,
          },
          description: route.description ?? route.summary ?? "",
        },
        response: route.responses.map(res => ({
          name: `${res.statusCode} ${res.description ?? ""}`,
          status: String(res.statusCode),
          code: res.statusCode,
          _postman_previewlanguage: "json",
          body: res.exampleJson ?? "",
        })),
      };

      if (bodyParams.length) {
        const bodyObj = {};
        for (const p of bodyParams) bodyObj[p.name] = p.example ?? "";
        item.request.body = {
          mode: "raw",
          raw: JSON.stringify(bodyObj, null, 2),
          options: { raw: { language: "json" } },
        };
      }

      return item;
    }),
  }));

  return {
    info: {
      name: project?.name ?? "API Collection",
      description: project?.description ?? "",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    variable: [{ key: "baseUrl", value: "http://localhost:4000", type: "string" }, { key: "token", value: "", type: "string" }],
    item: folders,
  };
}

export async function exportMarkdown(projectId) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, description: true, slug: true },
  });

  const tables = await prisma.erdTable.findMany({
    where: { projectId },
    orderBy: { name: "asc" },
    include: { columns: { orderBy: { sortOrder: "asc" } } },
  });

  const groups = await prisma.apiGroup.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" },
    include: {
      routes: { orderBy: { path: "asc" }, include: { parameters: true, responses: true } },
    },
  });

  const lines = [];
  lines.push(`# ${project?.name ?? "Project"}`);
  if (project?.description) {
    lines.push("");
    lines.push(project.description);
  }

  lines.push("");
  lines.push("## ERD");
  for (const t of tables) {
    lines.push("");
    lines.push(`### Table \`${t.name}\``);
    if (t.description) {
      lines.push(t.description);
    }
    lines.push("");
    lines.push("| Column | Type | Flags |");
    lines.push("| --- | --- | --- |");
    for (const c of t.columns) {
      const flags = [
        c.isPk ? "PK" : null,
        c.isFk ? "FK" : null,
        c.isUnique ? "UNIQUE" : null,
        c.isNullable ? "NULL" : "NOT NULL",
      ]
        .filter(Boolean)
        .join(", ");
      lines.push(`| ${c.name} | ${c.dataType} | ${flags} |`);
    }
  }

  lines.push("");
  lines.push("## API");
  for (const g of groups) {
    lines.push("");
    lines.push(`### ${g.name}${g.prefix ? ` (${g.prefix})` : ""}`);
    if (g.description) {
      lines.push(g.description);
    }
    for (const route of g.routes) {
      lines.push("");
      lines.push(
        `- **${route.method}** \`${(g.prefix ?? "") + route.path}\` — ${route.summary ?? route.status}`,
      );
      if (route.description) {
        lines.push(`  - ${route.description}`);
      }
    }
  }

  return lines.join("\n");
}
