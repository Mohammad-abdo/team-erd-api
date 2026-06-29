-- Pause / resume support for work shifts
ALTER TABLE `work_shifts` ADD COLUMN `paused_at` DATETIME(3) NULL;
ALTER TABLE `work_shifts` ADD COLUMN `paused_seconds` INTEGER NOT NULL DEFAULT 0;
