import { asyncHandler } from "../../utils/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import * as membersService from "../projects/members.service.js";

export const accept = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.sub },
    select: { email: true },
  });
  if (!user) {
    throw new HttpError(401, "Unauthorized");
  }

  const result = await membersService.acceptInvitation({
    userId: req.user.sub,
    userEmail: user.email,
    token: req.body.token,
  });

  res.status(200).json({
    projectId: result.projectId,
    alreadyMember: result.alreadyMember,
    member: {
      id: result.member.id,
      role: result.member.role,
      joinedAt: result.member.joinedAt,
    },
  });
});
