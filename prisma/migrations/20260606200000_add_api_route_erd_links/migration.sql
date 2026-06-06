-- CreateTable
CREATE TABLE `api_route_erd_links` (
    `id` VARCHAR(191) NOT NULL,
    `route_id` VARCHAR(191) NOT NULL,
    `erd_table_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `api_route_erd_links_route_id_idx`(`route_id`),
    INDEX `api_route_erd_links_erd_table_id_idx`(`erd_table_id`),
    UNIQUE INDEX `api_route_erd_links_route_id_erd_table_id_key`(`route_id`, `erd_table_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `api_route_erd_links` ADD CONSTRAINT `api_route_erd_links_route_id_fkey` FOREIGN KEY (`route_id`) REFERENCES `api_routes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `api_route_erd_links` ADD CONSTRAINT `api_route_erd_links_erd_table_id_fkey` FOREIGN KEY (`erd_table_id`) REFERENCES `erd_tables`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
