-- CreateTable
CREATE TABLE `api_test_settings` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `base_url` VARCHAR(500) NOT NULL DEFAULT 'http://localhost:3000',
    `auth_token` TEXT NULL,
    `headers` JSON NULL,
    `body` LONGTEXT NULL,

    INDEX `api_test_settings_project_id_idx`(`project_id`),
    UNIQUE INDEX `api_test_settings_project_id_user_id_key`(`project_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `api_test_settings` ADD CONSTRAINT `api_test_settings_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `api_test_settings` ADD CONSTRAINT `api_test_settings_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
