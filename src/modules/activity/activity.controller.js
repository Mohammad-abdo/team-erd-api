import { asyncHandler } from "../../utils/asyncHandler.js";
import { listActivityFeed } from "./activity.feed.service.js";

export const feed = asyncHandler(async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  const items = await listActivityFeed(req.params.projectId, { limit });
  res.json({ items });
});
