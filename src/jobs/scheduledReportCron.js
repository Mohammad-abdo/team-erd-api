import { config } from "../config/index.js";
import { runDueScheduledReports } from "../modules/analytics/scheduledReport.service.js";

let lastRunKey = null;

function currentRunKey(now = new Date()) {
  return `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}`;
}

function shouldRunNow(now = new Date()) {
  if (!config.scheduledReportCron) return false;
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
    const result = await runDueScheduledReports();
    if (result.ran > 0) {
      console.log("[report-cron] Run complete:", result);
    }
  } catch (err) {
    console.error("[report-cron] Run failed:", err.message);
    lastRunKey = null;
  }
}

export function startScheduledReportCron() {
  if (!config.scheduledReportCron) return;
  console.log("[report-cron] Enabled — delivers custom reports each UTC hour");
  setInterval(() => {
    tick().catch((err) => console.error("[report-cron] Tick error:", err.message));
  }, 60_000);
  tick().catch((err) => console.error("[report-cron] Initial tick error:", err.message));
}
