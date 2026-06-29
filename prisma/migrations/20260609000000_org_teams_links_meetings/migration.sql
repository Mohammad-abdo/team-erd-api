-- Organizations + nested teams + project links + meeting reminders (additive, no data loss)

CREATE TABLE `organizations` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `slug` VARCHAR(120) NOT NULL,
    `settings` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `organizations_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Default org from platform settings (workspace title) or fallback name
INSERT INTO `organizations` (`id`, `name`, `slug`, `settings`, `created_at`)
SELECT
    'org_default',
    COALESCE(
        (SELECT `workspace_title` FROM `platform_settings` WHERE `id` = 'default' LIMIT 1),
        'Default Organization'
    ),
    'default',
    NULL,
    CURRENT_TIMESTAMP(3)
WHERE NOT EXISTS (SELECT 1 FROM `organizations` WHERE `id` = 'org_default');

ALTER TABLE `users` ADD COLUMN `organization_id` VARCHAR(191) NULL;
CREATE INDEX `users_organization_id_idx` ON `users`(`organization_id`);
ALTER TABLE `users` ADD CONSTRAINT `users_organization_id_fkey`
    FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE `users` SET `organization_id` = 'org_default' WHERE `organization_id` IS NULL;

ALTER TABLE `teams` ADD COLUMN `organization_id` VARCHAR(191) NULL;
ALTER TABLE `teams` ADD COLUMN `parent_team_id` VARCHAR(191) NULL;
CREATE INDEX `teams_organization_id_idx` ON `teams`(`organization_id`);
CREATE INDEX `teams_parent_team_id_idx` ON `teams`(`parent_team_id`);
ALTER TABLE `teams` ADD CONSTRAINT `teams_organization_id_fkey`
    FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `teams` ADD CONSTRAINT `teams_parent_team_id_fkey`
    FOREIGN KEY (`parent_team_id`) REFERENCES `teams`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE `teams` SET `organization_id` = 'org_default' WHERE `organization_id` IS NULL;

ALTER TABLE `projects` ADD COLUMN `organization_id` VARCHAR(191) NULL;
ALTER TABLE `projects` ADD COLUMN `figma_url` VARCHAR(500) NULL;
ALTER TABLE `projects` ADD COLUMN `github_url` VARCHAR(500) NULL;
ALTER TABLE `projects` ADD COLUMN `live_url` VARCHAR(500) NULL;
ALTER TABLE `projects` ADD COLUMN `docs_url` VARCHAR(500) NULL;
CREATE INDEX `projects_organization_id_idx` ON `projects`(`organization_id`);
ALTER TABLE `projects` ADD CONSTRAINT `projects_organization_id_fkey`
    FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE `projects` SET `organization_id` = 'org_default' WHERE `organization_id` IS NULL;

CREATE TABLE `meeting_reminders` (
    `id` VARCHAR(191) NOT NULL,
    `team_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(300) NOT NULL,
    `description` TEXT NULL,
    `scheduled_at` DATETIME(3) NOT NULL,
    `attendee_ids` JSON NOT NULL,
    `voice_enabled` BOOLEAN NOT NULL DEFAULT true,
    `notified_at` DATETIME(3) NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `meeting_reminders_team_id_scheduled_at_idx`(`team_id`, `scheduled_at`),
    INDEX `meeting_reminders_scheduled_at_notified_at_idx`(`scheduled_at`, `notified_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `meeting_reminders` ADD CONSTRAINT `meeting_reminders_team_id_fkey`
    FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `meeting_reminders` ADD CONSTRAINT `meeting_reminders_created_by_fkey`
    FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
