import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { assertTeamManager } from "../teams/teams.service.js";
import { deliverToUsers } from "../../lib/notify.js";

export const createMeetingSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  scheduledAt: z.string().datetime(),
  attendeeIds: z.array(z.string().min(1)).max(50),
  voiceEnabled: z.boolean().optional(),
});

export async function listMeetingsForTeam(actorId, teamId) {
  await assertTeamManager(actorId, teamId);
  return prisma.meetingReminder.findMany({
    where: { teamId },
    orderBy: { scheduledAt: "asc" },
    take: 100,
  });
}

export async function createMeeting(actorId, teamId, input) {
  await assertTeamManager(actorId, teamId);

  const members = await prisma.teamMember.findMany({
    where: { teamId, userId: { in: input.attendeeIds } },
    select: { userId: true },
  });
  const allowed = new Set(members.map((m) => m.userId));
  const invalid = input.attendeeIds.filter((id) => !allowed.has(id));
  if (invalid.length) throw new HttpError(400, "All attendees must be team members");

  return prisma.meetingReminder.create({
    data: {
      teamId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      scheduledAt: new Date(input.scheduledAt),
      attendeeIds: input.attendeeIds,
      voiceEnabled: input.voiceEnabled ?? true,
      createdById: actorId,
    },
  });
}

export async function deleteMeeting(actorId, teamId, meetingId) {
  await assertTeamManager(actorId, teamId);
  const row = await prisma.meetingReminder.findFirst({
    where: { id: meetingId, teamId },
  });
  if (!row) throw new HttpError(404, "Meeting not found");
  await prisma.meetingReminder.delete({ where: { id: meetingId } });
}

/** Cron: notify attendees for due meetings (once). */
export async function processDueMeetingReminders() {
  const now = new Date();
  const due = await prisma.meetingReminder.findMany({
    where: {
      scheduledAt: { lte: now },
      notifiedAt: null,
    },
    take: 50,
  });

  for (const m of due) {
    const ids = Array.isArray(m.attendeeIds) ? m.attendeeIds : [];
    if (ids.length) {
      await deliverToUsers(ids, {
        type: "meeting_reminder",
        title: m.title,
        body: m.description ?? "Meeting starting now",
        link: `/teams/${m.teamId}`,
        meta: { meetingId: m.id, voiceEnabled: m.voiceEnabled },
      });
    }
    await prisma.meetingReminder.update({
      where: { id: m.id },
      data: { notifiedAt: now },
    });
  }

  return due.length;
}
