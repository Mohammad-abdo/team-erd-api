import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as publicService from "./public.service.js";

const r = Router();

r.get("/projects/:slug", asyncHandler(async (req, res) => {
  const data = await publicService.getPublicProjectBySlug(req.params.slug);
  res.json(data);
}));

export default r;
