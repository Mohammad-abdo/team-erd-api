import { TeamRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../utils/httpError.js";
import { isOrgAdmin } from "./adminAccess.js";

export function requireTeamLead(teamIdParam = "teamId") {
  return async function teamLeadGuard(req, _res, next) {
    try {
      const teamId = req.params[teamIdParam];
      if (!teamId) {
        return next(new HttpError(400, "Team id required"));
      }
      if (await isOrgAdmin(req.user.sub)) {
        return next();
      }
      const member = await prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId, userId: req.user.sub } },
      });
      if (!member || member.role !== TeamRole.TEAM_LEAD) {
        return next(new HttpError(403, "Team lead or organization admin required"));
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
