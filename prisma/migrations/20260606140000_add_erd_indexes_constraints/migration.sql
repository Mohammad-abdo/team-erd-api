-- CreateTable
CREATE TABLE `erd_table_indexes` (
    `id` VARCHAR(191) NOT NULL,
    `table_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `column_names` JSON NOT NULL,
    `is_unique` BOOLEAN NOT NULL DEFAULT false,
    `sort_order` INTEGER NOT NULL DEFAULT 0,

    INDEX `erd_table_indexes_table_id_idx`(`table_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `erd_check_constraints` (
    `id` VARCHAR(191) NOT NULL,
    `table_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `expression` TEXT NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,

    INDEX `erd_check_constraints_table_id_idx`(`table_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `erd_table_indexes` ADD CONSTRAINT `erd_table_indexes_table_id_fkey` FOREIGN KEY (`table_id`) REFERENCES `erd_tables`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `erd_check_constraints` ADD CONSTRAINT `erd_check_constraints_table_id_fkey` FOREIGN KEY (`table_id`) REFERENCES `erd_tables`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
