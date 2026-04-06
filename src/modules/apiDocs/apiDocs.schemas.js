import { z } from "zod";
import { HttpMethod, ApiRouteStatus, ApiParameterLocation } from "@prisma/client";

export const createGroupSchema = z.object({
  name: z.string().min(1).max(200),
  prefix: z.string().max(200).optional(),
  description: z.string().max(5000).optional(),
  sortOrder: z.number().int().optional(),
});

export const updateGroupSchema = createGroupSchema.partial();

export const createRouteSchema = z.object({
  method: z.nativeEnum(HttpMethod),
  path: z.string().min(1).max(500),
  summary: z.string().max(500).optional(),
  description: z.string().max(10000).optional(),
  authRequired: z.boolean().optional(),
  roleRequired: z.string().max(120).nullable().optional(),
  status: z.nativeEnum(ApiRouteStatus).optional(),
});

export const updateRouteSchema = createRouteSchema.partial();

export const createParameterSchema = z.object({
  location: z.nativeEnum(ApiParameterLocation),
  name: z.string().min(1).max(200),
  dataType: z.string().min(1).max(120),
  isRequired: z.boolean().optional(),
  description: z.string().max(2000).optional(),
  example: z.string().max(2000).optional(),
});

export const updateParameterSchema = createParameterSchema.partial();

export const createResponseSchema = z.object({
  statusCode: z.number().int().min(100).max(599),
  description: z.string().max(2000).optional(),
  exampleJson: z.string().max(50000).nullable().optional(),
});

export const updateResponseSchema = createResponseSchema.partial();
