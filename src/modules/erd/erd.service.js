import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { emitToProject } from "../../sockets/emit.js";
import { logActivity } from "../activity/activity.service.js";

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

export async function listTables(projectId) {
  return prisma.erdTable.findMany({
    where: { projectId },
    orderBy: { name: "asc" },
    include: {
      columns: { orderBy: { sortOrder: "asc" } },
    },
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
    include: { columns: true },
  });

  await logActivity({
    projectId,
    userId,
    action: "created",
    entityType: "erd_table",
    entityId: table.id,
    newValues: { name: table.name },
  });

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
    include: { columns: { orderBy: { sortOrder: "asc" } } },
  });

  await logActivity({
    projectId,
    userId,
    action: "updated",
    entityType: "erd_table",
    entityId: tableId,
    newValues: input,
  });

  emitToProject(projectId, "erd:updated", { at: Date.now() });

  return table;
}

export async function deleteTable(projectId, userId, tableId) {
  await assertTableInProject(projectId, tableId);
  await prisma.erdTable.delete({ where: { id: tableId } });

  await logActivity({
    projectId,
    userId,
    action: "deleted",
    entityType: "erd_table",
    entityId: tableId,
  });

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

  emitToProject(projectId, "erd:updated", { at: Date.now() });
}

export async function listRelations(projectId) {
  return prisma.erdRelation.findMany({
    where: { projectId },
    orderBy: { id: "asc" },
  });
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

  emitToProject(projectId, "erd:updated", { at: Date.now() });
}
