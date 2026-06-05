import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { slugify } from "../../utils/slug.js";
import { isPlatformAdmin } from "../../middleware/adminAccess.js";

async function uniqueSlug(base) {
  let slug = slugify(base);
  for (let i = 0; i < 20; i += 1) {
    const taken = await prisma.projectTemplate.findUnique({ where: { slug } });
    if (!taken) return slug;
    slug = `${slugify(base)}-${Math.random().toString(36).slice(2, 6)}`;
  }
  throw new HttpError(500, "Could not allocate template slug");
}

export async function listTemplates() {
  return prisma.projectTemplate.findMany({
    where: { isPublic: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      createdAt: true,
      createdBy: { select: { id: true, name: true } },
    },
  });
}

export async function createTemplate(userId, input) {
  if (!(await isPlatformAdmin(userId))) {
    throw new HttpError(403, "Only platform admin can create templates");
  }
  const slug = await uniqueSlug(input.name);
  return prisma.projectTemplate.create({
    data: {
      name: input.name.trim(),
      slug,
      description: input.description?.trim() ?? null,
      erdJson: input.erdJson ?? null,
      apiJson: input.apiJson ?? null,
      isPublic: input.isPublic ?? true,
      createdById: userId,
    },
  });
}

export async function createProjectFromTemplate(userId, templateId, { name, teamIds = [] }) {
  const template = await prisma.projectTemplate.findUnique({ where: { id: templateId } });
  if (!template?.isPublic) throw new HttpError(404, "Template not found");

  const { createProject } = await import("../projects/projects.service.js");
  const project = await createProject(userId, {
    name,
    description: template.description,
    visibility: "PRIVATE",
    teamIds,
  });

  if (template.erdJson?.tables?.length) {
    const { importErdSchema } = await import("../import/import.service.js");
    await importErdSchema(project.id, userId, {
      tables: template.erdJson.tables,
      relations: template.erdJson.relations ?? [],
      clearExisting: false,
    });
  }

  if (template.apiJson?.groups?.length) {
    const { importApiDocs } = await import("../import/import.service.js");
    await importApiDocs(project.id, userId, {
      groups: template.apiJson.groups,
      clearExisting: false,
    });
  }

  return project;
}
