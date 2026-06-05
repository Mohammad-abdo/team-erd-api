import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { globalSearch } from "./search.service.js";

const r = Router();

r.use(requireAuth);

r.get("/", asyncHandler(async (req, res) => {
  const q = String(req.query.q ?? "");
  const results = await globalSearch(req.user.sub, q);
  res.json(results);
}));

export default r;
