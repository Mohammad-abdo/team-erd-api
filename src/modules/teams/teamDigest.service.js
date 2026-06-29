import { PlatformRole, TaskStatus, TeamRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { sendEmail, isEmailConfigured } from "../../lib/email.js";
import { assertTeamManager } from "./teams.service.js";

function startOfToday() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function memberDigestRow(userId, weekAgo, today) {
  const [user, projectTasks, dailyPending, dailyWeek, shiftHours] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    }),
    prisma.projectTask.findMany({
      where: { assignees: { some: { userId } }, status: { not: TaskStatus.DONE } },
      select: {
        id: true,
        title: true,
        status: true,
        dueDate: true,
        project: { select: { name: true } },
      },
      take: 8,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.dailyTask.count({
      where: { assigneeId: userId, taskDate: today, status: { not: TaskStatus.DONE } },
    }),
    prisma.dailyTask.groupBy({
      by: ["status"],
      where: { assigneeId: userId, taskDate: { gte: weekAgo } },
      _count: { _all: true },
    }),
    prisma.workShift.findMany({
      where: { userId, startedAt: { gte: weekAgo } },
      select: { startedAt: true, endedAt: true },
    }),
  ]);

  if (!user) return null;

  const now = new Date();
  const overdue = projectTasks.filter((t) => t.dueDate && new Date(t.dueDate) < now).length;
  const dailyDone = dailyWeek.find((r) => r.status === TaskStatus.DONE)?._count._all ?? 0;
  const weekShiftHours = shiftHours.reduce((sum, s) => {
    const end = s.endedAt ? new Date(s.endedAt) : new Date();
    return sum + Math.max(0, (end - new Date(s.startedAt)) / 3600000);
  }, 0);

  return {
    user,
    activeTasks: projectTasks.length,
    overdue,
    dailyPending,
    dailyDone,
    weekShiftHours: Math.round(weekShiftHours * 10) / 10,
    sampleTasks: projectTasks.slice(0, 3).map((t) => ({
      title: t.title,
      project: t.project?.name,
      status: t.status,
    })),
  };
}

function buildDigestHtml(team, rows, weekLabel) {
  const memberBlocks = rows
    .map((row) => {
      const tasks = row.sampleTasks
        .map((t) => `<li>${t.title} <em>(${t.project ?? "—"}, ${t.status})</em></li>`)
        .join("");
      return `
        <div style="margin-bottom:16px;padding:12px;border:1px solid #e2e8f0;border-radius:8px;">
          <strong>${row.user.name}</strong>
          <p style="margin:4px 0;color:#64748b;font-size:13px;">
            ${row.activeTasks} active · ${row.overdue} overdue · ${row.dailyPending} daily pending · ${row.dailyDone} daily done · ${row.weekShiftHours}h shifts (${weekLabel})
          </p>
          ${tasks ? `<ul style="margin:8px 0 0;padding-left:18px;font-size:13px;">${tasks}</ul>` : ""}
        </div>`;
    })
    .join("");

  return `
    <div style="font-family:system-ui,sans-serif;max-width:640px;color:#0f172a;">
      <h2 style="margin:0 0 8px;">Weekly team digest — ${team.name}</h2>
      <p style="color:#64748b;font-size:14px;">Summary for ${rows.length} members · ${weekLabel}</p>
      ${memberBlocks}
      <p style="font-size:12px;color:#94a3b8;margin-top:24px;">Sent from DBForge</p>
    </div>`;
}

function buildDigestText(team, rows, weekLabel) {
  const lines = [`Weekly team digest — ${team.name}`, `Period: ${weekLabel}`, ""];
  for (const row of rows) {
    lines.push(`${row.user.name}`);
    lines.push(
      `  ${row.activeTasks} active, ${row.overdue} overdue, ${row.dailyPending} daily pending, ${row.dailyDone} daily done, ${row.weekShiftHours}h shifts`,
    );
    for (const t of row.sampleTasks) {
      lines.push(`  - ${t.title} (${t.project ?? "—"}, ${t.status})`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function buildTeamDigest(teamId) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });

  if (!team) throw new HttpError(404, "Team not found");

  const today = startOfToday();
  const weekAgo = new Date(today);
  weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
  const weekLabel = "Last 7 days";

  const rows = (
    await Promise.all(team.members.map((m) => memberDigestRow(m.userId, weekAgo, today)))
  ).filter(Boolean);

  return { team, rows, weekLabel };
}

export async function sendTeamWeeklyDigest(actorId, teamId) {
  await assertTeamManager(actorId, teamId);

  if (!isEmailConfigured()) {
    throw new HttpError(503, "Email is not configured on this server");
  }

  const [digest, lead] = await Promise.all([
    buildTeamDigest(teamId),
    prisma.user.findUnique({
      where: { id: actorId },
      select: { email: true, name: true },
    }),
  ]);

  if (!lead?.email) throw new HttpError(400, "Your account has no email address");

  const { team, rows, weekLabel } = digest;
  const subject = `Weekly digest — ${team.name}`;
  const text = buildDigestText(team, rows, weekLabel);
  const html = buildDigestHtml(team, rows, weekLabel);

  await sendEmail({ to: lead.email, subject, text, html });

  return { sent: true, recipient: lead.email, memberCount: rows.length };
}

export async function sendAutomatedTeamWeeklyDigest(teamId) {
  if (!isEmailConfigured()) {
    return { sent: false, reason: "email_not_configured" };
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: {
        where: { role: { in: [TeamRole.TEAM_LEAD, TeamRole.PROJECT_MANAGER] } },
        include: { user: { select: { id: true, email: true, name: true } } },
      },
    },
  });

  if (!team) return { sent: false, reason: "team_not_found" };

  const recipients = team.members
    .map((m) => m.user)
    .filter((u) => u?.email);

  if (!recipients.length) {
    return { sent: false, reason: "no_team_leads" };
  }

  const { rows, weekLabel } = await buildTeamDigest(teamId);
  const subject = `Weekly digest — ${team.name}`;
  const text = buildDigestText(team, rows, weekLabel);
  const html = buildDigestHtml(team, rows, weekLabel);

  for (const lead of recipients) {
    await sendEmail({ to: lead.email, subject, text, html });
  }

  return { sent: true, recipients: recipients.map((u) => u.email), memberCount: rows.length };
}

export async function runScheduledWeeklyDigests() {
  if (!isEmailConfigured()) {
    return { teams: 0, emailsSent: 0, skipped: true, reason: "email_not_configured" };
  }

  const orgAdmins = await prisma.user.findMany({
    where: { platformRole: PlatformRole.ORG_ADMIN, isActive: true },
    select: { id: true, email: true, name: true, organizationId: true },
  });

  const teams = await prisma.team.findMany({ select: { id: true, name: true, organizationId: true } });
  let emailsSent = 0;
  let teamsSent = 0;
  const emailed = new Set();

  for (const team of teams) {
    try {
      const result = await sendAutomatedTeamWeeklyDigest(team.id);
      if (result.sent) {
        teamsSent += 1;
        for (const email of result.recipients ?? []) {
          if (!emailed.has(email)) {
            emailed.add(email);
            emailsSent += 1;
          }
        }
      }
    } catch (err) {
      console.error(`[weekly-digest] Failed for team ${team.name} (${team.id}):`, err.message);
    }
  }

  for (const admin of orgAdmins) {
    if (!admin.email || emailed.has(admin.email) || !admin.organizationId) continue;
    const orgTeams = teams.filter((t) => t.organizationId === admin.organizationId);
    if (!orgTeams.length) continue;
    try {
      const digest = await buildTeamDigest(orgTeams[0].id);
      const subject = `Organization weekly digest`;
      const text = buildDigestText({ name: "Your organization" }, digest.rows, digest.weekLabel);
      const html = buildDigestHtml({ name: "Your organization" }, digest.rows, digest.weekLabel);
      await sendEmail({ to: admin.email, subject, text, html });
      emailed.add(admin.email);
      emailsSent += 1;
    } catch (err) {
      console.error(`[weekly-digest] Org admin digest failed for ${admin.email}:`, err.message);
    }
  }

  return { teams: teams.length, teamsSent, emailsSent, skipped: false };
}
