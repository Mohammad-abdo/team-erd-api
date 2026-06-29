-- AdminAuditLog organization scope
ALTER TABLE `admin_audit_logs` ADD COLUMN `organization_id` VARCHAR(191) NULL;
CREATE INDEX `admin_audit_logs_organization_id_created_at_idx` ON `admin_audit_logs`(`organization_id`, `created_at`);
ALTER TABLE `admin_audit_logs` ADD CONSTRAINT `admin_audit_logs_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Project rich create fields
ALTER TABLE `projects` ADD COLUMN `start_date` DATE NULL;
ALTER TABLE `projects` ADD COLUMN `deadline` DATE NULL;
ALTER TABLE `projects` ADD COLUMN `client_requirements` TEXT NULL;
ALTER TABLE `projects` ADD COLUMN `examples_json` JSON NULL;

-- Project attachments
CREATE TABLE `project_attachments` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(40) NOT NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `stored_path` VARCHAR(500) NOT NULL,
    `mime_type` VARCHAR(120) NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `uploaded_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    INDEX `project_attachments_project_id_idx`(`project_id`),
    CONSTRAINT `project_attachments_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `project_attachments_uploaded_by_fkey` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- TeamRole: add PROJECT_MANAGER
ALTER TABLE `team_members` MODIFY `role` ENUM('PROJECT_MANAGER', 'TEAM_LEAD', 'MEMBER') NOT NULL DEFAULT 'MEMBER';

-- Organization invitations
CREATE TABLE `organization_invitations` (
    `id` VARCHAR(191) NOT NULL,
    `organization_id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `token` VARCHAR(128) NOT NULL,
    `platform_role` ENUM('SUPER_ADMIN', 'ORG_ADMIN', 'TEAM_ADMIN', 'MEMBER', 'CLIENT') NOT NULL DEFAULT 'MEMBER',
    `team_id` VARCHAR(191) NULL,
    `team_role` ENUM('PROJECT_MANAGER', 'TEAM_LEAD', 'MEMBER') NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `accepted_at` DATETIME(3) NULL,
    `invited_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `organization_invitations_token_key`(`token`),
    INDEX `organization_invitations_organization_id_idx`(`organization_id`),
    INDEX `organization_invitations_email_idx`(`email`),
    CONSTRAINT `organization_invitations_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `organization_invitations_team_id_fkey` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `organization_invitations_invited_by_fkey` FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Focus task FK
ALTER TABLE `today_focus_items` ADD CONSTRAINT `today_focus_items_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `project_tasks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX `today_focus_items_task_id_idx` ON `today_focus_items`(`task_id`);

-- API Studio: nested groups + request history
ALTER TABLE `api_groups` ADD COLUMN `parent_group_id` VARCHAR(191) NULL;
CREATE INDEX `api_groups_parent_group_id_idx` ON `api_groups`(`parent_group_id`);
ALTER TABLE `api_groups` ADD CONSTRAINT `api_groups_parent_group_id_fkey` FOREIGN KEY (`parent_group_id`) REFERENCES `api_groups`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `api_request_history` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `method` VARCHAR(10) NOT NULL,
    `url` VARCHAR(2000) NOT NULL,
    `request_json` JSON NOT NULL,
    `response_json` JSON NULL,
    `status_code` INTEGER NULL,
    `duration_ms` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    INDEX `api_request_history_project_id_user_id_created_at_idx`(`project_id`, `user_id`, `created_at`),
    CONSTRAINT `api_request_history_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `api_request_history_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
