import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { encryptSecret, decryptSecret } from "../../lib/dbProfileCrypto.js";

function toPublicProfile(row) {
  return {
    id: row.id,
    name: row.name,
    dialect: row.dialect,
    host: row.host,
    port: row.port,
    user: row.user,
    database: row.database,
    schemaName: row.schemaName,
    hasPassword: Boolean(row.passwordEnc),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function connectionFromProfile(row) {
  return {
    host: row.host,
    port: row.port,
    user: row.user,
    password: decryptSecret(row.passwordEnc),
    database: row.database,
    ...(row.dialect === "postgres" ? { schema: row.schemaName ?? "public" } : {}),
  };
}

export async function listDbProfiles(projectId) {
  const rows = await prisma.projectDbProfile.findMany({
    where: { projectId },
    orderBy: { name: "asc" },
  });
  return rows.map(toPublicProfile);
}

export async function getDbProfile(projectId, profileId) {
  const row = await prisma.projectDbProfile.findFirst({
    where: { id: profileId, projectId },
  });
  if (!row) {
    throw new HttpError(404, "Database profile not found");
  }
  return row;
}

export async function resolveConnection(projectId, input) {
  if (input.profileId) {
    const row = await getDbProfile(projectId, input.profileId);
    return { dialect: row.dialect, connection: connectionFromProfile(row), profile: row };
  }
  const dialect = input.dialect ?? "mysql";
  const connection = {
    host: input.host,
    port: input.port,
    user: input.user,
    password: input.password ?? "",
    database: input.database,
    ...(dialect === "postgres" ? { schema: input.schema ?? "public" } : {}),
  };
  return { dialect, connection, profile: null };
}

export async function createDbProfile(projectId, userId, input) {
  const password = input.password ?? "";
  if (!password.trim()) {
    throw new HttpError(400, "Password is required when saving a profile");
  }

  const row = await prisma.projectDbProfile.create({
    data: {
      projectId,
      name: input.name.trim(),
      dialect: input.dialect,
      host: input.host.trim(),
      port: input.port ?? (input.dialect === "postgres" ? 5432 : 3306),
      user: input.user.trim(),
      passwordEnc: encryptSecret(password),
      database: input.database.trim(),
      schemaName: input.dialect === "postgres" ? (input.schema?.trim() || "public") : null,
      createdById: userId,
    },
  });
  return toPublicProfile(row);
}

export async function updateDbProfile(projectId, profileId, input) {
  const existing = await getDbProfile(projectId, profileId);
  const passwordEnc =
    input.password !== undefined && input.password !== ""
      ? encryptSecret(input.password)
      : existing.passwordEnc;

  const row = await prisma.projectDbProfile.update({
    where: { id: profileId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.dialect !== undefined ? { dialect: input.dialect } : {}),
      ...(input.host !== undefined ? { host: input.host.trim() } : {}),
      ...(input.port !== undefined ? { port: input.port } : {}),
      ...(input.user !== undefined ? { user: input.user.trim() } : {}),
      passwordEnc,
      ...(input.database !== undefined ? { database: input.database.trim() } : {}),
      ...(input.schema !== undefined
        ? { schemaName: input.schema?.trim() || "public" }
        : {}),
    },
  });
  return toPublicProfile(row);
}

export async function deleteDbProfile(projectId, profileId) {
  await getDbProfile(projectId, profileId);
  await prisma.projectDbProfile.delete({ where: { id: profileId } });
}
