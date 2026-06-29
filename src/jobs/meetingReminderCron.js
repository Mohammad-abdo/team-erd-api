import { processDueMeetingReminders } from "../modules/meetings/meetings.service.js";

export function startMeetingReminderCron() {
  if (process.env.MEETING_REMINDER_CRON !== "1") return;

  const tick = async () => {
    try {
      const n = await processDueMeetingReminders();
      if (n > 0) console.log(`[meeting-cron] notified ${n} meetings`);
    } catch (err) {
      console.error("[meeting-cron]", err);
    }
  };

  tick();
  setInterval(tick, 60_000);
}
