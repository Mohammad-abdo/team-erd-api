import { prisma } from "../../lib/prisma.js";
import { emitToUser } from "../../sockets/emit.js";

const NOTIFY_ACTIONS = new Set(["created", "deleted", "updated"]);
const NOTIFY_ENTITIES = new Set([
  "erd_table",
  "erd_column",
  "erd_relation",
  "erd_index",
  "erd_check",
]);

const ENTITY_LABEL = {
  erd_table: "table",
  erd_column: "column",
  erd_relation: "relation",
  erd_index: "index",
  erd_check: "check constraint",
};

export async function notifySchemaChange({
  projectId,
  actorId,
  action,
  entityType,
  label,
}) {
  if (!NOTIFY_ACTIONS.has(action) || !NOTIFY_ENTITIES.has(entityType)) return;
  if (action === "updated" && entityType === "erd_column") return;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      name: true,
      leaderId: true,
      members: { select: { userId: true } },
    },
  });
  if (!project) return;

  const recipientIds = [
    ...new Set([
      ...project.members.map((m) => m.userId),
      project.leaderId,
    ].filter((id) => id && id !== actorId)),
  ];
  if (!recipientIds.length) return;

  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { name: true },
  });
  const actorName = actor?.name ?? "A teammate";
  const entityLabel = ENTITY_LABEL[entityType] ?? entityType;
  const detail = label ? ` "${label}"` : "";
  const title = `Schema ${action}: ${entityLabel}${detail}`;
  const body = `${actorName} ${action} a ${entityLabel}${detail} in ${project.name}`;

  const notifications = await Promise.all(
    recipientIds.map((userId) =>
      prisma.notification.create({
        data: {
          userId,
          type: "schema_change",
          title,
          body,
          data: { projectId, action, entityType, label: label ?? null },
        },
      }),
    ),
  );

  for (const notification of notifications) {
    emitToUser(notification.userId, "notification:new", { notification });
  }
}
