import { config } from "../config/index.js";
import { runScheduledWeeklyDigests } from "../modules/teams/teamDigest.service.js";

let lastRunKey = null;

function currentRunKey(now = new Date()) {
  return `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${config.weeklyDigestCronUtcHour}`;
}

function shouldRunNow(now = new Date()) {
  if (!config.weeklyDigestCron) return false;
  if (now.getUTCDay() !== config.weeklyDigestCronUtcDay) return false;
  if (now.getUTCHours() !== config.weeklyDigestCronUtcHour) return false;
  if (now.getUTCMinutes() >= 5) return false;
  const key = currentRunKey(now);
  if (lastRunKey === key) return false;
  return true;
}

async function tick() {
  if (!shouldRunNow()) return;
  const key = currentRunKey();
  lastRunKey = key;
  try {
    const result = await runScheduledWeeklyDigests();
    console.log("[weekly-digest] Cron run complete:", result);
  } catch (err) {
    console.error("[weekly-digest] Cron run failed:", err.message);
    lastRunKey = null;
  }
}

export function startWeeklyDigestCron() {
  if (!config.weeklyDigestCron) {
    return;
  }
  console.log(
    `[weekly-digest] Cron enabled — UTC day ${config.weeklyDigestCronUtcDay} at ${config.weeklyDigestCronUtcHour}:00`,
  );
  setInterval(() => {
    tick().catch((err) => console.error("[weekly-digest] Tick error:", err.message));
  }, 60_000);
  tick().catch((err) => console.error("[weekly-digest] Initial tick error:", err.message));
}
