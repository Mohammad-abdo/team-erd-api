-- CreateTable
CREATE TABLE `project_webhooks` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `url` VARCHAR(500) NOT NULL,
    `secret` VARCHAR(128) NULL,
    `events` JSON NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_status` INTEGER NULL,
    `last_error` VARCHAR(500) NULL,
    `last_triggered_at` DATETIME(3) NULL,

    INDEX `project_webhooks_project_id_idx`(`project_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `project_webhooks` ADD CONSTRAINT `project_webhooks_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_webhooks` ADD CONSTRAINT `project_webhooks_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
