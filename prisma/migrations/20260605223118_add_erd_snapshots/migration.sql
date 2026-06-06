-- CreateTable
CREATE TABLE `erd_snapshots` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `label` VARCHAR(200) NOT NULL,
    `snapshot_json` JSON NOT NULL,
    `table_count` INTEGER NOT NULL DEFAULT 0,
    `relation_count` INTEGER NOT NULL DEFAULT 0,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `erd_snapshots_project_id_created_at_idx`(`project_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `erd_snapshots` ADD CONSTRAINT `erd_snapshots_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `erd_snapshots` ADD CONSTRAINT `erd_snapshots_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
