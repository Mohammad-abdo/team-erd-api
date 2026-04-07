/*
  Warnings:

  - Added the required column `updated_at` to the `projects` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `projects` ADD COLUMN `health_stage` VARCHAR(30) NULL,
    ADD COLUMN `last_activity_at` DATETIME(3) NULL,
    ADD COLUMN `updated_at` DATETIME(3) NOT NULL;

-- CreateIndex
CREATE INDEX `projects_health_stage_idx` ON `projects`(`health_stage`);
