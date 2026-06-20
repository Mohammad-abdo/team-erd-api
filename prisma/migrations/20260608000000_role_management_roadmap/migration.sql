-- AlterEnum PlatformRole: add ORG_ADMIN
ALTER TABLE `users` MODIFY `platform_role` ENUM('SUPER_ADMIN', 'ORG_ADMIN', 'MEMBER', 'CLIENT') NOT NULL DEFAULT 'MEMBER';

-- Time-bound access
ALTER TABLE `project_members` ADD COLUMN `expires_at` DATETIME(3) NULL;
ALTER TABLE `client_project_access` ADD COLUMN `expires_at` DATETIME(3) NULL;

-- Access requests
CREATE TABLE `access_requests` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `requested_role` ENUM('LEADER', 'EDITOR', 'VIEWER', 'COMMENTER') NOT NULL,
    `message` TEXT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'DENIED') NOT NULL DEFAULT 'PENDING',
    `reviewed_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reviewed_at` DATETIME(3) NULL,

    INDEX `access_requests_project_id_status_idx`(`project_id`, `status`),
    INDEX `access_requests_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `access_requests` ADD CONSTRAINT `access_requests_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `access_requests` ADD CONSTRAINT `access_requests_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `access_requests` ADD CONSTRAINT `access_requests_reviewed_by_fkey` FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
