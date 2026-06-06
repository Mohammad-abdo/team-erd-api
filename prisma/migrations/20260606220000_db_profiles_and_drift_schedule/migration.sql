-- CreateTable
CREATE TABLE `project_db_profiles` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `dialect` VARCHAR(20) NOT NULL,
    `host` VARCHAR(255) NOT NULL,
    `port` INTEGER NOT NULL DEFAULT 3306,
    `user` VARCHAR(120) NOT NULL,
    `password_enc` TEXT NOT NULL,
    `database` VARCHAR(200) NOT NULL,
    `schema_name` VARCHAR(128) NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `project_db_profiles_project_id_name_key`(`project_id`, `name`),
    INDEX `project_db_profiles_project_id_idx`(`project_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `project_drift_schedules` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `profile_id` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `utc_day` INTEGER NOT NULL DEFAULT 1,
    `utc_hour` INTEGER NOT NULL DEFAULT 6,
    `last_run_at` DATETIME(3) NULL,
    `last_run_status` VARCHAR(30) NULL,
    `last_issue_count` INTEGER NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `project_drift_schedules_project_id_key`(`project_id`),
    INDEX `project_drift_schedules_profile_id_idx`(`profile_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `project_db_profiles` ADD CONSTRAINT `project_db_profiles_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_db_profiles` ADD CONSTRAINT `project_db_profiles_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_drift_schedules` ADD CONSTRAINT `project_drift_schedules_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_drift_schedules` ADD CONSTRAINT `project_drift_schedules_profile_id_fkey` FOREIGN KEY (`profile_id`) REFERENCES `project_db_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_drift_schedules` ADD CONSTRAINT `project_drift_schedules_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
