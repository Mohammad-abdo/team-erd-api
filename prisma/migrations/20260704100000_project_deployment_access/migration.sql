-- Project deployment URLs and access credentials (JSON array per project)
ALTER TABLE `projects` ADD COLUMN `deployment_access_json` JSON NULL;
