import { prisma } from "../../lib/prisma.js";
import { emitToProject } from "../../sockets/emit.js";
import { logActivity } from "../activity/activity.service.js";

function layoutGrid(i) {
  return { x: 48 + (i % 5) * 268, y: 48 + Math.floor(i / 5) * 320 };
}

async function importErdSchemaTx(tx, projectId, userId, { tables, relations, clearExisting }) {
  if (clearExisting) {
    await tx.erdRelation.deleteMany({ where: { projectId } });
    await tx.erdTable.deleteMany({ where: { projectId } });
  }

  const tableIdMap = new Map();
  const existingCount = clearExisting ? 0 : await tx.erdTable.count({ where: { projectId } });

  for (let i = 0; i < tables.length; i++) {
    const t = tables[i];
    const pos = layoutGrid(existingCount + i);
    const created = await tx.erdTable.create({
      data: {
        projectId,
        name: t.name,
        label: t.label || null,
        color: t.color || null,
        description: t.description || null,
        x: pos.x,
        y: pos.y,
        createdById: userId,
      },
    });
    tableIdMap.set(t.name.toLowerCase(), created.id);

    if (t.columns?.length) {
      await tx.erdColumn.createMany({
        data: t.columns.map((c, ci) => ({
          tableId: created.id,
          name: c.name,
          dataType: c.dataType || "varchar(255)",
          isPk: c.isPk ?? false,
          isFk: c.isFk ?? false,
          isNullable: c.isNullable ?? true,
          isUnique: c.isUnique ?? false,
          defaultValue: c.defaultValue || null,
          description: c.description || null,
          sortOrder: ci,
        })),
      });
    }

    if (t.indexes?.length) {
      for (let ii = 0; ii < t.indexes.length; ii++) {
        const idx = t.indexes[ii];
        const columnNames = Array.isArray(idx.columnNames) ? idx.columnNames : [];
        if (!columnNames.length) continue;
        await tx.erdTableIndex.create({
          data: {
            tableId: created.id,
            name: idx.name || null,
            columnNames,
            isUnique: idx.isUnique ?? false,
            sortOrder: idx.sortOrder ?? ii,
          },
        });
      }
    }

    if (t.checkConstraints?.length) {
      for (let ci = 0; ci < t.checkConstraints.length; ci++) {
        const chk = t.checkConstraints[ci];
        if (!chk.expression) continue;
        await tx.erdCheckConstraint.create({
          data: {
            tableId: created.id,
            name: chk.name || null,
            expression: chk.expression,
            sortOrder: chk.sortOrder ?? ci,
          },
        });
      }
    }
  }

  if (relations?.length) {
    const allTables = await tx.erdTable.findMany({
      where: { projectId },
      include: { columns: true },
    });
    const tblByName = new Map(allTables.map((t) => [t.name.toLowerCase(), t]));

    for (const r of relations) {
      const fromT = tblByName.get(r.fromTable?.toLowerCase());
      const toT = tblByName.get(r.toTable?.toLowerCase());
      if (!fromT || !toT) continue;

      let fromColId = null;
      let toColId = null;
      if (r.fromColumn) {
        const col = fromT.columns.find((c) => c.name.toLowerCase() === r.fromColumn.toLowerCase());
        if (col) fromColId = col.id;
      }
      if (r.toColumn) {
        const col = toT.columns.find((c) => c.name.toLowerCase() === r.toColumn.toLowerCase());
        if (col) toColId = col.id;
      }

      await tx.erdRelation.create({
        data: {
          projectId,
          fromTableId: fromT.id,
          toTableId: toT.id,
          relationType: r.relationType || "ONE_TO_MANY",
          fromColumnId: fromColId,
          toColumnId: toColId,
          label: r.label || null,
          createdById: userId,
        },
      });
    }
  }

  return { tablesCreated: tables.length, relationsCreated: relations?.length ?? 0 };
}

export async function importErdSchema(projectId, userId, input) {
  const result = await prisma.$transaction(async (tx) =>
    importErdSchemaTx(tx, projectId, userId, input),
  );

  await logActivity({
    projectId,
    userId,
    action: "imported",
    entityType: "erd_schema",
    entityId: projectId,
    newValues: { tables: input.tables.length, relations: input.relations?.length ?? 0 },
  });

  emitToProject(projectId, "erd:updated", { at: Date.now() });

  return result;
}

async function importApiDocsTx(tx, projectId, userId, { groups, clearExisting }) {
  if (clearExisting) {
    const existingGroups = await tx.apiGroup.findMany({
      where: { projectId },
      select: { id: true },
    });
    const groupIds = existingGroups.map((g) => g.id);
    if (groupIds.length) {
      const routeIds = await tx.apiRoute.findMany({
        where: { groupId: { in: groupIds } },
        select: { id: true },
      });
      const rIds = routeIds.map((r) => r.id);
      if (rIds.length) {
        await tx.apiRouteResponse.deleteMany({ where: { routeId: { in: rIds } } });
        await tx.apiParameter.deleteMany({ where: { routeId: { in: rIds } } });
      }
      await tx.apiRoute.deleteMany({ where: { groupId: { in: groupIds } } });
      await tx.apiGroup.deleteMany({ where: { projectId } });
    }
  }

  let routeCount = 0;

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    const group = await tx.apiGroup.create({
      data: {
        projectId,
        name: g.name,
        prefix: g.prefix || "",
        description: g.description || null,
        sortOrder: gi,
      },
    });

    if (g.routes?.length) {
      for (const r of g.routes) {
        const route = await tx.apiRoute.create({
          data: {
            groupId: group.id,
            method: r.method || "GET",
            path: r.path,
            summary: r.summary || null,
            description: r.description || null,
            authRequired: r.authRequired ?? false,
            status: "DRAFT",
            createdById: userId,
          },
        });
        routeCount++;

        if (r.parameters?.length) {
          await tx.apiParameter.createMany({
            data: r.parameters.map((p) => ({
              routeId: route.id,
              location: p.location || "QUERY",
              name: p.name,
              dataType: p.dataType || "string",
              isRequired: p.isRequired ?? false,
              description: p.description || null,
              example: p.example || null,
            })),
          });
        }

        if (r.responses?.length) {
          await tx.apiRouteResponse.createMany({
            data: r.responses.map((resp) => ({
              routeId: route.id,
              statusCode: resp.statusCode || 200,
              description: resp.description || null,
              exampleJson: resp.exampleJson || null,
            })),
          });
        }
      }
    }
  }

  return { groupsCreated: groups.length, routesCreated: routeCount };
}

export async function importApiDocs(projectId, userId, input) {
  const result = await prisma.$transaction(async (tx) =>
    importApiDocsTx(tx, projectId, userId, input),
  );

  await logActivity({
    projectId,
    userId,
    action: "imported",
    entityType: "api_docs",
    entityId: projectId,
    newValues: { groups: input.groups.length, routes: result.routesCreated },
  });

  emitToProject(projectId, "api:updated", { at: Date.now() });

  return result;
}

/* ── OpenAPI 3.0 / Swagger import ─────────────────────────────────────── */
export async function importSwagger(projectId, userId, { spec, clearExisting }) {
  if (!spec || !spec.paths) throw new Error("Invalid OpenAPI spec: missing 'paths'");

  /* Build a tag → group map */
  const tagNames = (spec.tags ?? []).map(t => t.name);
  /* Also collect tags used in operations that aren't in spec.tags */
  for (const [, pathItem] of Object.entries(spec.paths)) {
    for (const [, op] of Object.entries(pathItem)) {
      if (op?.tags) for (const t of op.tags) if (!tagNames.includes(t)) tagNames.push(t);
    }
  }
  if (!tagNames.length) tagNames.push("Default");

  /* Convert to our internal groups format */
  const groupMap = {};
  for (const tag of tagNames) {
    const tagDef = (spec.tags ?? []).find(t => t.name === tag);
    groupMap[tag] = { name: tag, prefix: "", description: tagDef?.description ?? "", routes: [] };
  }

  const openApiLocMap = { query: "QUERY", header: "HEADER", path: "PATH", cookie: "HEADER" };

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];
    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (!op) continue;

      const tag = op.tags?.[0] ?? "Default";
      if (!groupMap[tag]) groupMap[tag] = { name: tag, prefix: "", description: "", routes: [] };

      const parameters = [];

      /* path/query/header params */
      for (const p of (op.parameters ?? [])) {
        if (p.in === "body") continue; // OAS2 style, skip
        parameters.push({
          location: openApiLocMap[p.in] ?? "QUERY",
          name: p.name,
          dataType: p.schema?.type ?? "string",
          isRequired: p.required ?? false,
          description: p.description ?? null,
          example: p.example != null ? String(p.example) : null,
        });
      }

      /* requestBody → BODY params */
      const rb = op.requestBody;
      if (rb) {
        const schema = rb.content?.["application/json"]?.schema ?? rb.content?.["*/*"]?.schema;
        if (schema?.properties) {
          for (const [name, prop] of Object.entries(schema.properties)) {
            parameters.push({
              location: "BODY",
              name,
              dataType: prop.type ?? "string",
              isRequired: (schema.required ?? []).includes(name),
              description: prop.description ?? null,
              example: prop.example != null ? String(prop.example) : null,
            });
          }
        }
      }

      const responses = [];
      for (const [code, resp] of Object.entries(op.responses ?? {})) {
        const statusCode = parseInt(code, 10);
        if (isNaN(statusCode)) continue;
        const exJson = resp.content?.["application/json"]?.example;
        responses.push({
          statusCode,
          description: resp.description ?? null,
          exampleJson: exJson != null ? JSON.stringify(exJson) : null,
        });
      }

      groupMap[tag].routes.push({
        method: method.toUpperCase(),
        path,
        summary: op.summary ?? null,
        description: op.description ?? null,
        authRequired: !!(op.security?.length),
        parameters,
        responses,
      });
    }
  }

  return importApiDocs(projectId, userId, {
    groups: Object.values(groupMap),
    clearExisting: clearExisting ?? false,
  });
}

/* ── Postman Collection v2.1 import ───────────────────────────────────── */
export async function importPostman(projectId, userId, { collection, clearExisting }) {
  if (!collection?.item) throw new Error("Invalid Postman collection: missing 'item'");

  const locMap = { query: "QUERY", header: "HEADER", path: "PATH" };

  function parseFolder(folder) {
    const routes = [];
    for (const item of (folder.item ?? [])) {
      /* nested folder → flatten */
      if (item.item) {
        routes.push(...parseFolder(item).routes);
        continue;
      }
      const req = item.request;
      if (!req) continue;

      const method = (req.method ?? "GET").toUpperCase();
      const rawUrl = typeof req.url === "string" ? req.url : (req.url?.raw ?? "");
      let path = rawUrl.replace(/{{[^}]+}}/g, "").replace(/^https?:\/\/[^/]+/, "") || "/";
      if (!path.startsWith("/")) path = "/" + path;

      const parameters = [];
      for (const h of (req.header ?? [])) {
        if (["content-type", "authorization"].includes(h.key?.toLowerCase())) continue;
        parameters.push({ location: "HEADER", name: h.key, dataType: "string", isRequired: false, description: h.description ?? null, example: h.value ?? null });
      }
      for (const q of (req.url?.query ?? [])) {
        parameters.push({ location: "QUERY", name: q.key, dataType: "string", isRequired: !(q.disabled ?? false), description: q.description ?? null, example: q.value ?? null });
      }
      for (const v of (req.url?.variable ?? [])) {
        parameters.push({ location: "PATH", name: v.key, dataType: "string", isRequired: true, description: v.description ?? null, example: v.value ?? null });
      }
      if (req.body?.mode === "raw" && req.body.raw) {
        try {
          const parsed = JSON.parse(req.body.raw);
          for (const [key, val] of Object.entries(parsed)) {
            parameters.push({ location: "BODY", name: key, dataType: typeof val, isRequired: false, description: null, example: String(val) });
          }
        } catch { /* not JSON */ }
      }

      const responses = (item.response ?? []).map(r => ({
        statusCode: parseInt(r.code ?? r.status ?? "200", 10) || 200,
        description: r.name ?? null,
        exampleJson: r.body ?? null,
      }));

      const authRequired = (req.header ?? []).some(h => h.key?.toLowerCase() === "authorization");

      routes.push({ method, path, summary: item.name ?? null, description: req.description ?? null, authRequired, parameters, responses });
    }
    return { name: folder.name ?? "Imported", prefix: "", description: folder.description ?? "", routes };
  }

  const groups = [];
  for (const item of collection.item) {
    if (item.item) {
      groups.push(parseFolder(item));
    } else {
      /* top-level request without folder */
      const ungrouped = groups.find(g => g.name === "Default") ?? { name: "Default", prefix: "", description: "", routes: [] };
      if (!groups.includes(ungrouped)) groups.push(ungrouped);
      ungrouped.routes.push(...parseFolder({ item: [item] }).routes);
    }
  }

  return importApiDocs(projectId, userId, {
    groups,
    clearExisting: clearExisting ?? false,
  });
}
