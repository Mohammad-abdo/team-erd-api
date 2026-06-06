import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { emitToProject } from "../../sockets/emit.js";
import { logActivity } from "../activity/activity.service.js";
import { importErdSchema } from "../import/import.service.js";
import { diffErdSchemas } from "../../lib/erdSnapshotDiff.js";

export async function buildSnapshotPayload(projectId) {
  const [tables, relations] = await Promise.all([
    prisma.erdTable.findMany({
      where: { projectId },
      orderBy: { name: "asc" },
      include: {
        columns: { orderBy: { sortOrder: "asc" } },
        indexes: { orderBy: { sortOrder: "asc" } },
        checkConstraints: { orderBy: { sortOrder: "asc" } },
      },
    }),
    prisma.erdRelation.findMany({
      where: { projectId },
      include: {
        fromTable: { select: { name: true } },
        toTable: { select: { name: true } },
        fromColumn: { select: { name: true } },
        toColumn: { select: { name: true } },
      },
    }),
  ]);

  return {
    tables: tables.map((t) => ({
      name: t.name,
      label: t.label,
      color: t.color,
      groupName: t.groupName,
      x: t.x,
      y: t.y,
      description: t.description,
      columns: t.columns.map((c) => ({
        name: c.name,
        dataType: c.dataType,
        isPk: c.isPk,
        isFk: c.isFk,
        isNullable: c.isNullable,
        isUnique: c.isUnique,
        defaultValue: c.defaultValue,
        description: c.description,
      })),
      indexes: (t.indexes ?? []).map((idx) => ({
        name: idx.name,
        columnNames: idx.columnNames,
        isUnique: idx.isUnique,
      })),
      checkConstraints: (t.checkConstraints ?? []).map((chk) => ({
        name: chk.name,
        expression: chk.expression,
      })),
    })),
    relations: relations.map((r) => ({
      fromTable: r.fromTable.name,
      toTable: r.toTable.name,
      fromColumn: r.fromColumn?.name ?? null,
      toColumn: r.toColumn?.name ?? null,
      relationType: r.relationType,
      label: r.label,
    })),
  };
}

export async function listSnapshots(projectId) {
  return prisma.erdSnapshot.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function getSnapshot(projectId, snapshotId) {
  const row = await prisma.erdSnapshot.findFirst({
    where: { id: snapshotId, projectId },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!row) throw new HttpError(404, "Snapshot not found");
  return row;
}

export async function createSnapshot(projectId, userId, { label }) {
  const payload = await buildSnapshotPayload(projectId);
  const snapshot = await prisma.erdSnapshot.create({
    data: {
      projectId,
      label: label?.trim() || `Snapshot ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
      snapshotJson: payload,
      tableCount: payload.tables.length,
      relationCount: payload.relations.length,
      createdById: userId,
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  await logActivity({
    projectId,
    userId,
    action: "created",
    entityType: "erd_snapshot",
    entityId: snapshot.id,
    newValues: { label: snapshot.label, tableCount: snapshot.tableCount },
  });

  return snapshot;
}

export async function restoreSnapshot(projectId, userId, snapshotId) {
  const row = await getSnapshot(projectId, snapshotId);
  const data = row.snapshotJson;

  await importErdSchema(projectId, userId, {
    tables: data.tables ?? [],
    relations: data.relations ?? [],
    clearExisting: true,
  });

  const tables = await prisma.erdTable.findMany({ where: { projectId } });
  const byName = new Map(tables.map((t) => [t.name.toLowerCase(), t]));

  for (const t of data.tables ?? []) {
    const rowTable = byName.get(t.name.toLowerCase());
    if (rowTable && (t.x != null || t.y != null)) {
      await prisma.erdTable.update({
        where: { id: rowTable.id },
        data: { x: t.x ?? rowTable.x, y: t.y ?? rowTable.y },
      });
    }
  }

  await logActivity({
    projectId,
    userId,
    action: "restored",
    entityType: "erd_snapshot",
    entityId: snapshotId,
    newValues: { label: row.label },
  });

  emitToProject(projectId, "erd:updated", { at: Date.now() });

  return { restored: true, snapshotId };
}

export async function deleteSnapshot(projectId, userId, snapshotId) {
  const row = await getSnapshot(projectId, snapshotId);
  await prisma.erdSnapshot.delete({ where: { id: row.id } });
  await logActivity({
    projectId,
    userId,
    action: "deleted",
    entityType: "erd_snapshot",
    entityId: snapshotId,
    oldValues: { label: row.label },
  });
}

async function resolveSchemaPayload(projectId, ref) {
  if (ref === "current") {
    return buildSnapshotPayload(projectId);
  }
  const row = await getSnapshot(projectId, ref);
  return row.snapshotJson;
}

async function resolveSchemaLabel(projectId, ref) {
  if (ref === "current") {
    return "Current schema";
  }
  const row = await getSnapshot(projectId, ref);
  return row.label;
}

export async function diffSnapshots(projectId, baseRef, targetRef) {
  if (baseRef === targetRef) {
    throw new HttpError(400, "Choose two different schemas to compare");
  }

  const [baseSchema, targetSchema, baseLabel, targetLabel] = await Promise.all([
    resolveSchemaPayload(projectId, baseRef),
    resolveSchemaPayload(projectId, targetRef),
    resolveSchemaLabel(projectId, baseRef),
    resolveSchemaLabel(projectId, targetRef),
  ]);

  const diff = diffErdSchemas(baseSchema, targetSchema);

  return {
    base: { ref: baseRef, label: baseLabel },
    target: { ref: targetRef, label: targetLabel },
    diff,
  };
}
