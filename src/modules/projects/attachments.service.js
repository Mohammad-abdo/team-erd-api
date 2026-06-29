import fs from "fs";
import path from "path";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { UPLOAD_ROOT } from "../../lib/projectAttachmentUpload.js";

export async function listProjectAttachments(projectId) {
  return prisma.projectAttachment.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    include: {
      uploadedBy: { select: { id: true, name: true } },
    },
  });
}

export async function createProjectAttachments(projectId, userId, files, kind = "example") {
  if (!files?.length) throw new HttpError(400, "No files uploaded");

  const rows = await prisma.$transaction(
    files.map((file) => prisma.projectAttachment.create({
      data: {
        projectId,
        kind,
        fileName: file.originalname,
        storedPath: path.relative(UPLOAD_ROOT, file.path).replace(/\\/g, "/"),
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedById: userId,
      },
      include: {
        uploadedBy: { select: { id: true, name: true } },
      },
    })),
  );

  return rows;
}

export async function deleteProjectAttachment(projectId, attachmentId, userId) {
  const row = await prisma.projectAttachment.findFirst({
    where: { id: attachmentId, projectId },
  });
  if (!row) throw new HttpError(404, "Attachment not found");

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { leaderId: true },
  });
  if (project?.leaderId !== userId && row.uploadedById !== userId) {
    throw new HttpError(403, "Not allowed to delete this attachment");
  }

  await prisma.projectAttachment.delete({ where: { id: attachmentId } });
}

export async function getProjectAttachmentFile(projectId, attachmentId) {
  const row = await prisma.projectAttachment.findFirst({
    where: { id: attachmentId, projectId },
  });
  if (!row) throw new HttpError(404, "Attachment not found");
  const filePath = path.join(UPLOAD_ROOT, row.storedPath);
  if (!fs.existsSync(filePath)) throw new HttpError(404, "File not found on server");
  return { filePath, fileName: row.fileName, mimeType: row.mimeType };
}
