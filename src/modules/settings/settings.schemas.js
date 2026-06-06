import { z } from "zod";

const optionalUrl = z.union([
  z.string().url().max(500),
  z.literal(""),
]);

export const updatePlatformBrandingSchema = z.object({
  logoUrl: optionalUrl.optional(),
  workspaceTitle: z.string().max(120).optional(),
  workspaceTagline: z.string().max(200).optional(),
});
