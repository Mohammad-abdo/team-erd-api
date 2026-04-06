import { z } from "zod";
import { ErdRelationType } from "@prisma/client";

export const createTableSchema = z.object({
  name: z.string().min(1).max(200),
  label: z.string().max(200).nullable().optional(),
  color: z.string().max(32).nullable().optional(),
  groupName: z.string().max(200).nullable().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  description: z.string().max(5000).nullable().optional(),
});

export const updateTableSchema = createTableSchema.partial();

export const createColumnSchema = z.object({
  name: z.string().min(1).max(200),
  dataType: z.string().min(1).max(120),
  isPk: z.boolean().optional(),
  isFk: z.boolean().optional(),
  isNullable: z.boolean().optional(),
  isUnique: z.boolean().optional(),
  defaultValue: z.string().max(500).nullable().optional(),
  description: z.string().max(2000).optional(),
  sortOrder: z.number().int().optional(),
});

export const updateColumnSchema = createColumnSchema.partial();

export const createRelationSchema = z.object({
  fromTableId: z.string().min(1),
  toTableId: z.string().min(1),
  relationType: z.nativeEnum(ErdRelationType),
  fromColumnId: z.string().nullable().optional(),
  toColumnId: z.string().nullable().optional(),
  label: z.string().max(200).optional(),
});

export const updateRelationSchema = createRelationSchema.partial();
