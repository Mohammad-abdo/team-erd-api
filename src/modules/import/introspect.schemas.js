import { z } from "zod";

export const mysqlIntrospectSchema = z.object({
  host: z.string().min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  user: z.string().min(1).max(128),
  password: z.string().max(256).optional(),
  database: z.string().min(1).max(128),
  clearExisting: z.boolean().optional(),
});
