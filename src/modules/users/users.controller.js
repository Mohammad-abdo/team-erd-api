import { asyncHandler } from "../../utils/asyncHandler.js";
import * as usersService from "./users.service.js";

export const me = asyncHandler(async (req, res) => {
  const user = await usersService.getUserById(req.user.sub);
  res.json({ user });
});

export const patchMe = asyncHandler(async (req, res) => {
  const user = await usersService.updateUserProfile(req.user.sub, req.body);
  res.json({ user });
});
