-- Add TEAM_ADMIN role, work shifts, and today focus items

ALTER TABLE `users` MODIFY `platform_role` ENUM('SUPER_ADMIN', 'ORG_ADMIN', 'TEAM_ADMIN', 'MEMBER', 'CLIENT') NOT NULL DEFAULT 'MEMBER';

CREATE TABLE `work_shifts` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `organization_id` VARCHAR(191) NOT NULL,
  `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `ended_at` DATETIME(3) NULL,
  `note` TEXT NULL,
  PRIMARY KEY (`id`),
  INDEX `work_shifts_user_id_started_at_idx`(`user_id`, `started_at`),
  INDEX `work_shifts_organization_id_started_at_idx`(`organization_id`, `started_at`),
  CONSTRAINT `work_shifts_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `work_shifts_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `today_focus_items` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `focus_date` DATE NOT NULL,
  `title` VARCHAR(500) NOT NULL,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `is_done` BOOLEAN NOT NULL DEFAULT false,
  `task_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `today_focus_items_user_id_focus_date_sort_order_idx`(`user_id`, `focus_date`, `sort_order`),
  CONSTRAINT `today_focus_items_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
