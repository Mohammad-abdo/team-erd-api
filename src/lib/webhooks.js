import { createHmac } from "crypto";
import { prisma } from "./prisma.js";
import { assertSafeWebhookUrl } from "./ssrfGuard.js";

const SOCKET_TO_WEBHOOK = {
  "erd:updated": "erd.updated",
  "api:updated": "api.updated",
  "members:updated": "member.updated",
  "comments:updated": "comment.updated",
  "project:updated": "project.updated",
  "project:deleted": "project.deleted",
};

export const WEBHOOK_EVENTS = [
  "erd.updated",
  "api.updated",
  "member.updated",
  "comment.updated",
  "project.updated",
  "project.deleted",
];

async function deliverWebhook(hook, event, payload) {
  await assertSafeWebhookUrl(hook.url);

  const body = JSON.stringify({
    event,
    projectId: hook.projectId,
    timestamp: new Date().toISOString(),
    data: payload ?? {},
  });

  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "DBForge-Webhook/1.0",
    "X-DBForge-Event": event,
  };

  if (hook.secret) {
    const sig = createHmac("sha256", hook.secret).update(body).digest("hex");
    headers["X-DBForge-Signature"] = `sha256=${sig}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(hook.url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });

    await prisma.projectWebhook.update({
      where: { id: hook.id },
      data: {
        lastStatus: res.status,
        lastError: res.ok ? null : `HTTP ${res.status}`,
        lastTriggeredAt: new Date(),
      },
    });
  } catch (err) {
    await prisma.projectWebhook.update({
      where: { id: hook.id },
      data: {
        lastStatus: 0,
        lastError: err.message?.slice(0, 500) ?? "delivery_failed",
        lastTriggeredAt: new Date(),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function deliverWebhookOnce(hook, event, payload) {
  await deliverWebhook(hook, event, payload);
}

export async function dispatchWebhooks(projectId, event, payload) {
  const hooks = await prisma.projectWebhook.findMany({
    where: { projectId, isActive: true },
  });

  const matching = hooks.filter((h) => {
    const events = Array.isArray(h.events) ? h.events : [];
    return events.includes("*") || events.includes(event);
  });

  await Promise.allSettled(matching.map((h) => deliverWebhook(h, event, payload)));
}

export function dispatchWebhooksForSocket(projectId, socketEvent, payload) {
  const mapped = SOCKET_TO_WEBHOOK[socketEvent];
  if (!mapped) return;
  dispatchWebhooks(projectId, mapped, payload).catch(() => {});
}
