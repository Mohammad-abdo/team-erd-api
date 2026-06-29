import { ProjectMemberRole } from "@prisma/client";
import { prisma } from "./prisma.js";
import { HttpError } from "../utils/httpError.js";
import { userIsOrgAdmin } from "./orgScope.js";
import { isOrgAdmin as isOrgAdminById } from "../middleware/adminAccess.js";
import { isTeamLeadOverUser } from "./teamHierarchy.js";

/**
 * Who may edit/delete a task:
 * - org/super admin, project leader
 * - task creator or assignee
 * - team lead over any assignee (or creator if unassigned)
 */
export async function assertCanEditTask(actorId, task, projectId) {
  const user = await prisma.user.findUnique({
    where: { id: actorId },
    select: { platformRole: true, organizationId: true },
  });
  if (userIsOrgAdmin(user) || await isOrgAdminById(actorId)) return;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { leaderId: true },
  });
  if (project?.leaderId === actorId) return;

  if (task.createdById === actorId) return;

  const assigneeIds = task.assignees?.map((a) => a.userId ?? a) ?? [];
  if (assigneeIds.includes(actorId)) return;

  for (const uid of assigneeIds.length ? assigneeIds : [task.createdById]) {
    if (await isTeamLeadOverUser(actorId, uid, user)) return;
  }

  throw new HttpError(403, "You can only edit your own tasks or tasks for your team");
}

async function assertAssigneesAreProjectMembers(projectId, assigneeIds) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      leaderId: true,
      members: { select: { userId: true } },
    },
  });
  if (!project) throw new HttpError(404, "Project not found");

  const allowed = new Set(project.members.map((m) => m.userId));
  if (project.leaderId) allowed.add(project.leaderId);

  for (const uid of assigneeIds) {
    if (!allowed.has(uid)) {
      throw new HttpError(400, "Assignee must be a project member");
    }
  }
}

/**
 * Who may set assignees on project tasks:
 * - org/super admin
 * - project leader → any project member
 * - team manager (PM/TL) over assignee in managed subtree
 * - otherwise self only
 */
export async function assertCanAssignTask(actorId, assigneeIds, projectId) {
  const user = await prisma.user.findUnique({
    where: { id: actorId },
    select: { platformRole: true, organizationId: true },
  });
  if (userIsOrgAdmin(user) || await isOrgAdminById(actorId)) return;

  const ids = assigneeIds?.length ? assigneeIds : [actorId];

  if (projectId && await isProjectLeader(actorId, projectId)) {
    await assertAssigneesAreProjectMembers(projectId, ids);
    return;
  }

  for (const uid of ids) {
    if (uid === actorId) continue;
    if (!(await isTeamLeadOverUser(actorId, uid, user))) {
      throw new HttpError(403, "You can only assign tasks to yourself or your team members");
    }
  }
}

export async function isProjectLeader(actorId, projectId) {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: { leaderId: true },
  });
  return p?.leaderId === actorId;
}

export async function hasEditorProjectRole(actorId, projectId) {
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: actorId } },
    select: { role: true },
  });
  if (!member) return false;
  return [ProjectMemberRole.LEADER, ProjectMemberRole.EDITOR].includes(member.role);
}
