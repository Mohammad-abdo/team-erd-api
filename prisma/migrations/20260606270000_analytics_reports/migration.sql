-- CreateTable
CREATE TABLE `custom_report_definitions` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `scope` ENUM('PLATFORM', 'PROJECT') NOT NULL DEFAULT 'PLATFORM',
    `project_id` VARCHAR(191) NULL,
    `metrics` JSON NOT NULL,
    `filters` JSON NULL,
    `format` ENUM('JSON', 'MARKDOWN') NOT NULL DEFAULT 'MARKDOWN',
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `custom_report_definitions_created_by_idx`(`created_by`),
    INDEX `custom_report_definitions_project_id_idx`(`project_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `scheduled_reports` (
    `id` VARCHAR(191) NOT NULL,
    `definition_id` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `cadence` ENUM('DAILY', 'WEEKLY') NOT NULL DEFAULT 'WEEKLY',
    `utc_day` INTEGER NOT NULL DEFAULT 1,
    `utc_hour` INTEGER NOT NULL DEFAULT 8,
    `recipient_emails` JSON NOT NULL,
    `last_run_at` DATETIME(3) NULL,
    `last_run_status` VARCHAR(30) NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `scheduled_reports_definition_id_idx`(`definition_id`),
    INDEX `scheduled_reports_enabled_idx`(`enabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `scheduled_report_runs` (
    `id` VARCHAR(191) NOT NULL,
    `scheduled_report_id` VARCHAR(191) NOT NULL,
    `status` VARCHAR(30) NOT NULL,
    `summary` JSON NULL,
    `error` TEXT NULL,
    `ran_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `scheduled_report_runs_scheduled_report_id_ran_at_idx`(`scheduled_report_id`, `ran_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `custom_report_definitions` ADD CONSTRAINT `custom_report_definitions_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `custom_report_definitions` ADD CONSTRAINT `custom_report_definitions_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `scheduled_reports` ADD CONSTRAINT `scheduled_reports_definition_id_fkey` FOREIGN KEY (`definition_id`) REFERENCES `custom_report_definitions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `scheduled_reports` ADD CONSTRAINT `scheduled_reports_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `scheduled_report_runs` ADD CONSTRAINT `scheduled_report_runs_scheduled_report_id_fkey` FOREIGN KEY (`scheduled_report_id`) REFERENCES `scheduled_reports`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
