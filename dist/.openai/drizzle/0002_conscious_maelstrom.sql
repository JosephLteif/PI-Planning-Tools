ALTER TABLE `stories` ADD `epic_id` text;--> statement-breakpoint
CREATE INDEX `stories_epic_idx` ON `stories` (`room_id`,`epic_id`);