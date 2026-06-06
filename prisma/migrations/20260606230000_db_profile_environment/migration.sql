-- Add environment tag to saved database profiles (dev / staging / production)
ALTER TABLE `project_db_profiles` ADD COLUMN `environment` VARCHAR(30) NOT NULL DEFAULT 'development';

DROP INDEX `project_db_profiles_project_id_name_key` ON `project_db_profiles`;

CREATE UNIQUE INDEX `project_db_profiles_project_id_name_environment_key` ON `project_db_profiles`(`project_id`, `name`, `environment`);

CREATE INDEX `project_db_profiles_project_id_environment_idx` ON `project_db_profiles`(`project_id`, `environment`);
