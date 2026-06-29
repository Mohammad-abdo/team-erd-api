import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { loadProjectMember } from "../../middleware/projectAccess.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { projectAttachmentUpload } from "../../lib/projectAttachmentUpload.js";
import * as attachmentsService from "./attachments.service.js";

const r = Router({ mergeParams: true });

r.use(requireAuth, loadProjectMember);

r.get(
  "/",
  asyncHandler(async (req, res) => {
    const attachments = await attachmentsService.listProjectAttachments(req.params.projectId);
    res.json({ attachments });
  }),
);

r.post(
  "/",
  projectAttachmentUpload.array("files", 10),
  asyncHandler(async (req, res) => {
    const kind = req.body?.kind ?? "example";
    const attachments = await attachmentsService.createProjectAttachments(
      req.params.projectId,
      req.user.sub,
      req.files ?? [],
      kind,
    );
    res.status(201).json({ attachments });
  }),
);

r.delete(
  "/:attachmentId",
  asyncHandler(async (req, res) => {
    await attachmentsService.deleteProjectAttachment(
      req.params.projectId,
      req.params.attachmentId,
      req.user.sub,
    );
    res.status(204).end();
  }),
);

export default r;
