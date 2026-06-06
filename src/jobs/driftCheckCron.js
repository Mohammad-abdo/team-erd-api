import { config } from "../config/index.js";
import { runScheduledDriftChecks } from "../modules/import/driftSchedule.service.js";

let lastRunKey = null;

function currentRunKey(now = new Date()) {
  return `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}`;
}

function shouldRunNow(now = new Date()) {
  if (!config.driftCheckCron) return false;
  if (now.getUTCMinutes() >= 10) return false;
  const key = currentRunKey(now);
  if (lastRunKey === key) return false;
  return true;
}

async function tick() {
  if (!shouldRunNow()) return;
  const key = currentRunKey();
  lastRunKey = key;
  try {
    const result = await runScheduledDriftChecks();
    if (result.ran > 0) {
      console.log("[drift-cron] Run complete:", result);
    }
  } catch (err) {
    console.error("[drift-cron] Run failed:", err.message);
    lastRunKey = null;
  }
}

export function startDriftCheckCron() {
  if (!config.driftCheckCron) {
    return;
  }
  console.log("[drift-cron] Enabled — checks project schedules each UTC hour");
  setInterval(() => {
    tick().catch((err) => console.error("[drift-cron] Tick error:", err.message));
  }, 60_000);
  tick().catch((err) => console.error("[drift-cron] Initial tick error:", err.message));
}
