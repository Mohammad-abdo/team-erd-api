import { config } from "../config/index.js";
import { processExpiredAccess } from "../modules/access/accessExpiry.service.js";

let lastRunKey = null;

function currentRunKey(now = new Date()) {
  return `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;
}

function shouldRunNow(now = new Date()) {
  if (!config.accessExpiryCron) return false;
  const key = currentRunKey(now);
  if (lastRunKey === key) return false;
  return now.getUTCHours() === 2 && now.getUTCMinutes() < 10;
}

async function tick() {
  if (!shouldRunNow()) return;
  const key = currentRunKey();
  lastRunKey = key;
  try {
    const result = await processExpiredAccess();
    if (result.expiredMembers || result.expiredClients || result.warnings) {
      console.log("[access-expiry-cron] Run complete:", result);
    }
  } catch (err) {
    console.error("[access-expiry-cron] Run failed:", err.message);
    lastRunKey = null;
  }
}

export function startAccessExpiryCron() {
  if (!config.accessExpiryCron) return;
  console.log("[access-expiry-cron] Enabled — daily UTC 02:00");
  setInterval(() => {
    tick().catch((err) => console.error("[access-expiry-cron] Tick error:", err.message));
  }, 60_000);
  tick().catch((err) => console.error("[access-expiry-cron] Initial tick error:", err.message));
}
