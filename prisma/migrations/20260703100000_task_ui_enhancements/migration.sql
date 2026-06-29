-- Task UI: checklist, dependencies, time hours, task comments
ALTER TABLE `project_tasks` ADD COLUMN `checklist` JSON NULL,
    ADD COLUMN `depends_on_ids` JSON NULL;

ALTER TABLE `task_progress_logs` ADD COLUMN `hours` DOUBLE NULL;

ALTER TABLE `comments` MODIFY `commentable_type` ENUM('ERD_TABLE', 'ERD_RELATION', 'API_ROUTE', 'TASK') NOT NULL;
