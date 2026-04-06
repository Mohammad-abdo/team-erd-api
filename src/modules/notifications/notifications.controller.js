import { asyncHandler } from "../../utils/asyncHandler.js";
import * as notificationsService from "./notifications.service.js";

export const list = asyncHandler(async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  const notifications = await notificationsService.listNotifications(req.user.sub, {
    limit,
  });
  res.json({ notifications });
});

export const markRead = asyncHandler(async (req, res) => {
  const notification = await notificationsService.markNotificationRead(
    req.user.sub,
    req.params.id,
  );
  res.json({ notification });
});
