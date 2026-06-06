import { z } from "zod";

const connectionFields = {
  host: z.string().min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  user: z.string().min(1).max(128),
  password: z.string().max(256).optional(),
  database: z.string().min(1).max(128),
  clearExisting: z.boolean().optional(),
};

export const mysqlIntrospectSchema = z.object(connectionFields);

export const postgresIntrospectSchema = z.object({
  ...connectionFields,
  schema: z.string().min(1).max(128).optional(),
});

const connectionOptional = {
  host: z.string().min(1).max(255).optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  user: z.string().min(1).max(128).optional(),
  password: z.string().max(256).optional(),
  database: z.string().min(1).max(128).optional(),
};

function profileOrConnection(schema) {
  return schema.refine(
    (data) => data.profileId || (data.host && data.user && data.database),
    { message: "Provide profileId or host, user, and database" },
  );
}

export const mysqlDriftSchema = profileOrConnection(
  z.object({
    profileId: z.string().min(1).optional(),
    ...connectionOptional,
  }),
);

export const postgresDriftSchema = profileOrConnection(
  z.object({
    profileId: z.string().min(1).optional(),
    ...connectionOptional,
    schema: z.string().min(1).max(128).optional(),
  }),
);
