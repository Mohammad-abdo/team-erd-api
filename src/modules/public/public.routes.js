import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as publicService from "./public.service.js";
import * as settingsService from "../settings/settings.service.js";

const r = Router();

r.get("/branding", asyncHandler(async (_req, res) => {
  const branding = await settingsService.getPlatformBranding();
  res.json({ branding });
}));

r.get("/projects/:slug", asyncHandler(async (req, res) => {
  const data = await publicService.getPublicProjectBySlug(req.params.slug);
  res.json(data);
}));

export default r;
