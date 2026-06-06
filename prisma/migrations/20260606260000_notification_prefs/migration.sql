-- Per-user notification preference toggles (JSON)
ALTER TABLE `users` ADD COLUMN `notification_prefs` JSON NULL;
