-- AlterTable: API tester environment profiles
ALTER TABLE `api_test_settings`
  ADD COLUMN `active_environment` VARCHAR(50) NOT NULL DEFAULT 'dev',
  ADD COLUMN `environments` JSON NULL;
