import { asyncHandler } from "../../utils/asyncHandler.js";
import * as webhooksService from "./webhooks.service.js";

export const list = asyncHandler(async (req, res) => {
  const webhooks = await webhooksService.listWebhooks(req.params.projectId);
  res.json({ webhooks, events: webhooksService.WEBHOOK_EVENTS });
});

export const create = asyncHandler(async (req, res) => {
  const webhook = await webhooksService.createWebhook(
    req.params.projectId,
    req.user.sub,
    req.body,
  );
  res.status(201).json({ webhook });
});

export const update = asyncHandler(async (req, res) => {
  const webhook = await webhooksService.updateWebhook(
    req.params.projectId,
    req.params.webhookId,
    req.body,
  );
  res.json({ webhook });
});

export const remove = asyncHandler(async (req, res) => {
  await webhooksService.deleteWebhook(req.params.projectId, req.params.webhookId);
  res.status(204).end();
});

export const test = asyncHandler(async (req, res) => {
  const webhook = await webhooksService.testWebhook(req.params.projectId, req.params.webhookId);
  res.json({ webhook });
});
