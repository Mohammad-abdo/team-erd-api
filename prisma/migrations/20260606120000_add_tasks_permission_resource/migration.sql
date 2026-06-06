-- AlterEnum: add TASKS to PermissionResource
ALTER TABLE `project_permissions` MODIFY `resource` ENUM('ERD', 'API', 'COMMENTS', 'EXPORTS', 'TASKS') NOT NULL;
