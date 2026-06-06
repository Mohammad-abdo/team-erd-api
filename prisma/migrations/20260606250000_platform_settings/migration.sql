-- Platform-wide branding (sidebar logo, workspace title/tagline)
CREATE TABLE `platform_settings` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'default',
    `logo_url` VARCHAR(500) NULL,
    `workspace_title` VARCHAR(120) NULL,
    `workspace_tagline` VARCHAR(200) NULL,
    `updated_at` DATETIME(3) NOT NULL,
    `updated_by_id` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `platform_settings` ADD CONSTRAINT `platform_settings_updated_by_id_fkey` FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
