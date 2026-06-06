import { asyncHandler } from "../../utils/asyncHandler.js";
import * as usersService from "./users.service.js";

export const me = asyncHandler(async (req, res) => {
  const user = await usersService.getUserById(req.user.sub);
  res.json({ user });
});

export const directory = asyncHandler(async (req, res) => {
  const users = await usersService.listUserDirectory({
    q: req.query.q,
    limit: req.query.limit,
  });
  res.json({ users });
});

export const patchMe = asyncHandler(async (req, res) => {
  const user = await usersService.updateUserProfile(req.user.sub, req.body);
  res.json({ user });
});

export const uploadAvatar = asyncHandler(async (req, res) => {
  const user = await usersService.uploadUserAvatar(req.user.sub, req.file, req);
  res.json({ user });
});

export const serveAvatar = asyncHandler(async (req, res) => {
  const { abs, mime } = usersService.getUserAvatarFile(
    req.params.userId,
    req.params.filename,
  );
  res.setHeader("Content-Type", mime);
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.sendFile(abs);
});
