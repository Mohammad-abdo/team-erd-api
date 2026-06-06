import { z } from "zod";
import { DB_PROFILE_ENVIRONMENTS } from "../../lib/dbProfileEnvironments.js";

const environmentField = z.enum(DB_PROFILE_ENVIRONMENTS).optional();

const connectionFields = {
  name: z.string().min(1).max(120),
  environment: environmentField,
  dialect: z.enum(["mysql", "postgres"]),
  host: z.string().min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  user: z.string().min(1).max(120),
  password: z.string().min(1).max(256),
  database: z.string().min(1).max(200),
  schema: z.string().min(1).max(128).optional(),
};

export const dbProfileCreateSchema = z.object(connectionFields);

export const dbProfileUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  environment: environmentField,
  dialect: z.enum(["mysql", "postgres"]).optional(),
  host: z.string().min(1).max(255).optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  user: z.string().min(1).max(120).optional(),
  password: z.string().max(256).optional(),
  database: z.string().min(1).max(200).optional(),
  schema: z.string().min(1).max(128).optional(),
});
