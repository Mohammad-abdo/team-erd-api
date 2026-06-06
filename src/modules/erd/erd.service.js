import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { emitToProject } from "../../sockets/emit.js";
import { logActivity } from "../activity/activity.service.js";
import { notifySchemaChange } from "../notifications/schemaNotifications.js";
import { validateErdSchema } from "../../lib/erdValidation.js";

async function notifyErdChange(projectId, userId, action, entityType, label) {
  try {
    await notifySchemaChange({ projectId, actorId: userId, action, entityType, label });
  } catch {
    // notifications are best-effort
  }
}

async function assertTableInProject(projectId, tableId) {
  const table = await prisma.erdTable.findFirst({
    where: { id: tableId, projectId },
  });
  if (!table) {
    throw new HttpError(404, "Table not found");
  }
  return table;
}

async function assertColumnInProjectTable(projectId, tableId, columnId) {
  const col = await prisma.erdColumn.findFirst({
    where: { id: columnId, tableId, table: { projectId } },
  });
  if (!col) {
    throw new HttpError(404, "Column not found");
  }
  return col;
}

const tableIncludes = {
  columns: { orderBy: { sortOrder: "asc" } },
  indexes: { orderBy: { sortOrder: "asc" } },
  checkConstraints: { orderBy: { sortOrder: "asc" } },
};

async function assertColumnNamesOnTable(tableId, columnNames) {
  const cols = await prisma.erdColumn.findMany({
    where: { tableId },
    select: { name: true },
  });
  const known = new Set(cols.map((c) => c.name.toLowerCase()));
  for (const name of columnNames) {
    if (!known.has(name.toLowerCase())) {
      throw new HttpError(400, `Column not found on table: ${name}`);
    }
  }
}

function defaultIndexName(tableName, columnNames, isUnique) {
  const prefix = isUnique ? "uq" : "idx";
  const raw = `${prefix}_${tableName}_${columnNames.join("_")}`.replace(/[^a-zA-Z0-9_]/g, "_");
  return raw.slice(0, 120);
}

export async function listTables(projectId) {
  return prisma.erdTable.findMany({
    where: { projectId },
    orderBy: { name: "asc" },
    include: tableIncludes,
  });
}

export async function createTable(projectId, userId, input) {
  const table = await prisma.erdTable.create({
    data: {
      projectId,
      name: input.name.trim(),
      label: input.label?.trim() ?? null,
      color: input.color ?? null,
      groupName: input.groupName?.trim() ?? null,
      x: input.x ?? 0,
      y: input.y ?? 0,
      description: input.description?.trim() ?? null,
      createdById: userId,
    },
    include: tableIncludes,
  });

  await logActivity({
    projectId,
    userId,
    action: "created",
    entityType: "erd_table",
    entityId: table.id,
    newValues: { name: table.name },
  });
  await notifyErdChange(projectId, userId, "created", "erd_table", table.name);

  emitToProject(projectId, "erd:updated", { at: Date.now() });

  return table;
}

export async function updateTable(projectId, userId, tableId, input) {
  await assertTableInProject(projectId, tableId);
  const table = await prisma.erdTable.update({
    where: { id: tableId },
    data: {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.label !== undefined && { label: input.label?.trim() ?? null }),
      ...(input.color !== undefined && { color: input.color ?? null }),
      ...(input.groupName !== undefined && { groupName: input.groupName?.trim() ?? null }),
      ...(input.x !== undefined && { x: input.x }),
      ...(input.y !== undefined && { y: input.y }),
      ...(input.description !== undefined && { description: input.description?.trim() ?? null }),
    },
    include: tableIncludes,
  });

  await logActivity({
    projectId,
    userId,
    action: "updated",
    entityType: "erd_table",
    entityId: tableId,
    newValues: input,
  });
  await notifyErdChange(projectId, userId, "updated", "erd_table", table.name);

  emitToProject(projectId, "erd:updated", { at: Date.now() });

  return table;
}

export async function deleteTable(projectId, userId, tableId) {
  const existing = await assertTableInProject(projectId, tableId);
  await prisma.erdTable.delete({ where: { id: tableId } });

  await logActivity({
    projectId,
    userId,
    action: "deleted",
    entityType: "erd_table",
    entityId: tableId,
  });
  await notifyErdChange(projectId, userId, "deleted", "erd_table", existing.name);

  emitToProject(projectId, "erd:updated", { at: Date.now() });
}

export async function createColumn(projectId, userId, tableId, input) {
  await assertTableInProject(projectId, tableId);
  const column = await prisma.erdColumn.create({
    data: {
      tableId,
      name: input.name.trim(),
      dataType: input.dataType.trim(),
      isPk: input.isPk ?? false,
      isFk: input.isFk ?? false,
      isNullable: input.isNullable ?? true,
      isUnique: input.isUnique ?? false,
      defaultValue: input.defaultValue === undefined ? undefined : input.defaultValue,
      description: input.description?.trim() ?? null,
      sortOrder: input.sortOrder ?? 0,
    },
  });

  await logActivity({
    projectId,
    userId,
    action: "created",
    entityType: "erd_column",
    entityId: column.id,
    newValues: { name: column.name, tableId },
  });
  await notifyErdChange(projectId, userId, "created", "erd_column", column.name);

  emitToProject(projectId, "erd:updated", { at: Date.now() });

  return column;
}

export async function updateColumn(projectId, userId, tableId, columnId, input) {
  await assertColumnInProjectTable(projectId, tableId, columnId);
  const column = await prisma.erdColumn.update({
    where: { id: columnId },
    data: {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.dataType !== undefined && { dataType: input.dataType.trim() }),
      ...(input.isPk !== undefined && { isPk: input.isPk }),
      ...(input.isFk !== undefined && { isFk: input.isFk }),
      ...(input.isNullable !== undefined && { isNullable: input.isNullable }),
      ...(input.isUnique !== undefined && { isUnique: input.isUnique }),
      ...(input.defaultValue !== undefined && { defaultValue: input.defaultValue }),
      ...(input.description !== undefined && { description: input.description?.trim() ?? null }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
    },
  });

  await logActivity({
    projectId,
    userId,
    action: "updated",
    entityType: "erd_column",
    entityId: columnId,
    newValues: input,
  });

  emitToProject(projectId, "erd:updated", { at: Date.now() });

  return column;
}

export async function deleteColumn(projectId, userId, tableId, columnId) {
  await assertColumnInProjectTable(projectId, tableId, columnId);
  await prisma.erdColumn.delete({ where: { id: columnId } });

  await logActivity({
    projectId,
    userId,
    action: "deleted",
    entityType: "erd_column",
    entityId: columnId,
  });
  await notifyErdChange(projectId, userId, "deleted", "erd_column", null);

  emitToProject(projectId, "erd:updated", { at: Date.now() });
}

export async function createTableIndex(projectId, userId, tableId, input) {
  const table = await assertTableInProject(projectId, tableId);
  const columnNames = input.columnNames.map((n) => n.trim());
  await assertColumnNamesOnTable(tableId, columnNames);

  const index = await prisma.erdTableIndex.create({
    data: {
      tableId,
      name: input.name?.trim() || defaultIndexName(table.name, columnNames, input.isUnique ?? false),
      columnNames,
      isUnique: input.isUnique ?? false,
      sortOrder: input.sortOrder ?? 0,
    },
  });

  await logActivity({
    projectId,
    userId,
    action: "created",
    entityType: "erd_index",
    entityId: index.id,
    newValues: { tableId, columnNames, isUnique: index.isUnique },
  });

  emitToProject(projectId, "erd:updated", { at: Date.now() });
  return index;
}

export async function deleteTableIndex(projectId, userId, tableId, indexId) {
  await assertTableInProject(projectId, tableId);
  const row = await prisma.erdTableIndex.findFirst({ where: { id: indexId, tableId } });
  if (!row) throw new HttpError(404, "Index not found");
  await prisma.erdTableIndex.delete({ where: { id: indexId } });

  await logActivity({
    projectId,
    userId,
    action: "deleted",
    entityType: "erd_index",
    entityId: indexId,
  });

  emitToProject(projectId, "erd:updated", { at: Date.now() });
}

export async function createCheckConstraint(projectId, userId, tableId, input) {
  const table = await assertTableInProject(projectId, tableId);
  const constraint = await prisma.erdCheckConstraint.create({
    data: {
      tableId,
      name: input.name?.trim() || `chk_${table.name}_${Date.now().toString(36)}`.slice(0, 120),
      expression: input.expression.trim(),
      sortOrder: input.sortOrder ?? 0,
    },
  });

  await logActivity({
    projectId,
    userId,
    action: "created",
    entityType: "erd_check",
    entityId: constraint.id,
    newValues: { tableId, expression: constraint.expression },
  });

  emitToProject(projectId, "erd:updated", { at: Date.now() });
  return constraint;
}

export async function deleteCheckConstraint(projectId, userId, tableId, constraintId) {
  await assertTableInProject(projectId, tableId);
  const row = await prisma.erdCheckConstraint.findFirst({
    where: { id: constraintId, tableId },
  });
  if (!row) throw new HttpError(404, "Check constraint not found");
  await prisma.erdCheckConstraint.delete({ where: { id: constraintId } });

  await logActivity({
    projectId,
    userId,
    action: "deleted",
    entityType: "erd_check",
    entityId: constraintId,
  });

  emitToProject(projectId, "erd:updated", { at: Date.now() });
}

export async function listRelations(projectId) {
  return prisma.erdRelation.findMany({
    where: { projectId },
    orderBy: { id: "asc" },
  });
}

export async function getValidation(projectId) {
  const [tables, relations] = await Promise.all([
    listTables(projectId),
    listRelations(projectId),
  ]);
  return validateErdSchema(tables, relations);
}

export async function createRelation(projectId, userId, input) {
  await assertTableInProject(projectId, input.fromTableId);
  await assertTableInProject(projectId, input.toTableId);

  if (input.fromColumnId) {
    await assertColumnInProjectTable(projectId, input.fromTableId, input.fromColumnId);
  }
  if (input.toColumnId) {
    await assertColumnInProjectTable(projectId, input.toTableId, input.toColumnId);
  }

  const relation = await prisma.erdRelation.create({
    data: {
      projectId,
      fromTableId: input.fromTableId,
      toTableId: input.toTableId,
      relationType: input.relationType,
      fromColumnId: input.fromColumnId ?? null,
      toColumnId: input.toColumnId ?? null,
      label: input.label?.trim() ?? null,
      createdById: userId,
    },
  });

  await logActivity({
    projectId,
    userId,
    action: "created",
    entityType: "erd_relation",
    entityId: relation.id,
    newValues: { from: input.fromTableId, to: input.toTableId },
  });
  await notifyErdChange(projectId, userId, "created", "erd_relation", relation.label ?? null);

  emitToProject(projectId, "erd:updated", { at: Date.now() });

  return relation;
}

export async function updateRelation(projectId, userId, relationId, input) {
  const existing = await prisma.erdRelation.findFirst({
    where: { id: relationId, projectId },
  });
  if (!existing) {
    throw new HttpError(404, "Relation not found");
  }

  if (input.fromTableId) {
    await assertTableInProject(projectId, input.fromTableId);
  }
  if (input.toTableId) {
    await assertTableInProject(projectId, input.toTableId);
  }

  const fromTableId = input.fromTableId ?? existing.fromTableId;
  const toTableId = input.toTableId ?? existing.toTableId;

  if (input.fromColumnId !== undefined && input.fromColumnId) {
    await assertColumnInProjectTable(projectId, fromTableId, input.fromColumnId);
  }
  if (input.toColumnId !== undefined && input.toColumnId) {
    await assertColumnInProjectTable(projectId, toTableId, input.toColumnId);
  }

  const relation = await prisma.erdRelation.update({
    where: { id: relationId },
    data: {
      ...(input.fromTableId !== undefined && { fromTableId: input.fromTableId }),
      ...(input.toTableId !== undefined && { toTableId: input.toTableId }),
      ...(input.relationType !== undefined && { relationType: input.relationType }),
      ...(input.fromColumnId !== undefined && { fromColumnId: input.fromColumnId }),
      ...(input.toColumnId !== undefined && { toColumnId: input.toColumnId }),
      ...(input.label !== undefined && { label: input.label?.trim() ?? null }),
    },
  });

  await logActivity({
    projectId,
    userId,
    action: "updated",
    entityType: "erd_relation",
    entityId: relationId,
    newValues: input,
  });
  await notifyErdChange(projectId, userId, "updated", "erd_relation", relation.label ?? null);

  emitToProject(projectId, "erd:updated", { at: Date.now() });

  return relation;
}

export async function deleteRelation(projectId, userId, relationId) {
  const existing = await prisma.erdRelation.findFirst({
    where: { id: relationId, projectId },
  });
  if (!existing) {
    throw new HttpError(404, "Relation not found");
  }

  await prisma.erdRelation.delete({ where: { id: relationId } });

  await logActivity({
    projectId,
    userId,
    action: "deleted",
    entityType: "erd_relation",
    entityId: relationId,
  });
  await notifyErdChange(projectId, userId, "deleted", "erd_relation", existing.label ?? null);

  emitToProject(projectId, "erd:updated", { at: Date.now() });
}
