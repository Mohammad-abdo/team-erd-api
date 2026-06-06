import { prisma } from "../../lib/prisma.js";
import { emitToUser } from "../../sockets/emit.js";

export async function notifyDriftDetected({
  projectId,
  actorId,
  issueCount,
  databaseLabel,
  inSync,
  source = "manual",
}) {
  if (inSync) return;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      name: true,
      leaderId: true,
      members: {
        where: { role: { in: ["LEADER", "EDITOR"] } },
        select: { userId: true },
      },
    },
  });
  if (!project) return;

  const recipientIds = [
    ...new Set([
      project.leaderId,
      ...project.members.map((m) => m.userId),
    ].filter((id) => id && id !== actorId)),
  ];
  if (!recipientIds.length) return;

  let actorName = "A teammate";
  if (source === "scheduled") {
    actorName = "Scheduled drift check";
  } else if (actorId) {
    const actor = await prisma.user.findUnique({
      where: { id: actorId },
      select: { name: true },
    });
    actorName = actor?.name ?? actorName;
  }

  const title = `Schema drift: ${issueCount} issue(s)`;
  const body = `${actorName} found ${issueCount} drift issue(s) vs ${databaseLabel ?? "database"} in ${project.name}`;

  const notifications = await Promise.all(
    recipientIds.map((userId) =>
      prisma.notification.create({
        data: {
          userId,
          type: "schema_drift",
          title,
          body,
          data: {
            projectId,
            issueCount,
            databaseLabel: databaseLabel ?? null,
            source,
          },
        },
      }),
    ),
  );

  for (const notification of notifications) {
    emitToUser(notification.userId, "notification:new", { notification });
  }
}
