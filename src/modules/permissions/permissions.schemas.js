import { z } from "zod";
import { PermissionAction, PermissionResource } from "@prisma/client";

export const upsertPermissionSchema = z.object({
  userId: z.string().min(1),
  resource: z.nativeEnum(PermissionResource),
  action: z.nativeEnum(PermissionAction),
});

export const deletePermissionSchema = z.object({
  userId: z.string().min(1),
  resource: z.nativeEnum(PermissionResource),
  action: z.nativeEnum(PermissionAction),
});
