import { asyncHandler } from "../../utils/asyncHandler.js";
import * as snapshotsService from "./erdSnapshots.service.js";

export const list = asyncHandler(async (req, res) => {
  const snapshots = await snapshotsService.listSnapshots(req.params.projectId);
  res.json({
    snapshots: snapshots.map((s) => ({
      id: s.id,
      label: s.label,
      tableCount: s.tableCount,
      relationCount: s.relationCount,
      createdAt: s.createdAt,
      createdBy: s.createdBy,
    })),
  });
});

export const getOne = asyncHandler(async (req, res) => {
  const snapshot = await snapshotsService.getSnapshot(req.params.projectId, req.params.snapshotId);
  res.json({ snapshot });
});

export const create = asyncHandler(async (req, res) => {
  const snapshot = await snapshotsService.createSnapshot(req.params.projectId, req.user.sub, req.body);
  res.status(201).json({ snapshot });
});

export const restore = asyncHandler(async (req, res) => {
  const result = await snapshotsService.restoreSnapshot(
    req.params.projectId,
    req.user.sub,
    req.params.snapshotId,
  );
  res.json(result);
});

export const remove = asyncHandler(async (req, res) => {
  await snapshotsService.deleteSnapshot(req.params.projectId, req.user.sub, req.params.snapshotId);
  res.status(204).end();
});
