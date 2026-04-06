/**
 * Heuristic project "lifecycle" for dashboard (no dedicated status column in DB).
 * Based on last activity and ERD/API/comment richness.
 */
export function computeProjectHealthStage({
  lastActivityAt,
  createdAt,
  tableCount,
  relationCount,
  routeCount,
  commentCount,
}) {
  const last = lastActivityAt ? new Date(lastActivityAt) : new Date(createdAt);
  const daysSince = (Date.now() - last.getTime()) / 86400000;
  const richness = tableCount + relationCount + routeCount + Math.min(commentCount, 20) * 0.25;

  if (daysSince > 30) {
    return "stopped";
  }
  if (daysSince > 14 && richness < 2) {
    return "waiting";
  }
  if (daysSince <= 7 && richness >= 4) {
    return "growing";
  }
  if (richness >= 1) {
    return "in_progress";
  }
  if (daysSince > 7) {
    return "waiting";
  }
  return "in_progress";
}
