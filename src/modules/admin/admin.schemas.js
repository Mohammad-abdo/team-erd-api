import { z } from "zod";
import { PlatformRole } from "@prisma/client";

export const createUserSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  platformRole: z.nativeEnum(PlatformRole).optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
  platformRole: z.nativeEnum(PlatformRole).optional(),
});
