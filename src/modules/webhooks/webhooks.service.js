import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { WEBHOOK_EVENTS, deliverWebhookOnce } from "../../lib/webhooks.js";

export { WEBHOOK_EVENTS };

export async function listWebhooks(projectId) {
  return prisma.projectWebhook.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      url: true,
      events: true,
      isActive: true,
      createdAt: true,
      lastStatus: true,
      lastError: true,
      lastTriggeredAt: true,
      createdBy: { select: { id: true, name: true } },
    },
  });
}

export async function createWebhook(projectId, userId, input) {
  const events = input.events?.length ? input.events : ["*"];
  const invalid = events.filter((e) => e !== "*" && !WEBHOOK_EVENTS.includes(e));
  if (invalid.length) {
    throw new HttpError(400, `Invalid events: ${invalid.join(", ")}`);
  }

  return prisma.projectWebhook.create({
    data: {
      projectId,
      url: input.url.trim(),
      secret: input.secret?.trim() || null,
      events,
      isActive: input.isActive ?? true,
      createdById: userId,
    },
    select: {
      id: true,
      url: true,
      events: true,
      isActive: true,
      createdAt: true,
      lastStatus: true,
      lastError: true,
      lastTriggeredAt: true,
    },
  });
}

export async function updateWebhook(projectId, webhookId, input) {
  const row = await prisma.projectWebhook.findFirst({
    where: { id: webhookId, projectId },
  });
  if (!row) throw new HttpError(404, "Webhook not found");

  if (input.events) {
    const invalid = input.events.filter((e) => e !== "*" && !WEBHOOK_EVENTS.includes(e));
    if (invalid.length) {
      throw new HttpError(400, `Invalid events: ${invalid.join(", ")}`);
    }
  }

  return prisma.projectWebhook.update({
    where: { id: webhookId },
    data: {
      ...(input.url !== undefined && { url: input.url.trim() }),
      ...(input.secret !== undefined && { secret: input.secret?.trim() || null }),
      ...(input.events !== undefined && { events: input.events }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
    select: {
      id: true,
      url: true,
      events: true,
      isActive: true,
      createdAt: true,
      lastStatus: true,
      lastError: true,
      lastTriggeredAt: true,
    },
  });
}

export async function deleteWebhook(projectId, webhookId) {
  const row = await prisma.projectWebhook.findFirst({
    where: { id: webhookId, projectId },
  });
  if (!row) throw new HttpError(404, "Webhook not found");
  await prisma.projectWebhook.delete({ where: { id: webhookId } });
}

export async function testWebhook(projectId, webhookId) {
  const row = await prisma.projectWebhook.findFirst({
    where: { id: webhookId, projectId },
  });
  if (!row) throw new HttpError(404, "Webhook not found");

  await deliverWebhookOnce(row, "webhook.test", { message: "DBForge test delivery" });
  return prisma.projectWebhook.findUnique({
    where: { id: webhookId },
    select: {
      id: true,
      url: true,
      events: true,
      isActive: true,
      lastStatus: true,
      lastError: true,
      lastTriggeredAt: true,
    },
  });
}
