-- Add CLIENT platform role and per-project visibility scopes for client portal users
ALTER TABLE `users` MODIFY `platform_role` ENUM('SUPER_ADMIN', 'MEMBER', 'CLIENT') NOT NULL DEFAULT 'MEMBER';

CREATE TABLE `client_project_access` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `view_overview` BOOLEAN NOT NULL DEFAULT true,
    `view_erd` BOOLEAN NOT NULL DEFAULT true,
    `view_api` BOOLEAN NOT NULL DEFAULT false,
    `view_report` BOOLEAN NOT NULL DEFAULT true,
    `view_tasks` BOOLEAN NOT NULL DEFAULT true,
    `view_comments` BOOLEAN NOT NULL DEFAULT false,
    `view_activity` BOOLEAN NOT NULL DEFAULT false,
    `view_health` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `client_project_access_project_id_user_id_key`(`project_id`, `user_id`),
    INDEX `client_project_access_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `client_project_access` ADD CONSTRAINT `client_project_access_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `client_project_access` ADD CONSTRAINT `client_project_access_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
