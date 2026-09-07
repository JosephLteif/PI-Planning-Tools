ALTER TABLE `planning_rounds` ADD `timer_started_at` text;--> statement-breakpoint
ALTER TABLE `rooms` ADD `ai_enabled` integer DEFAULT 1 NOT NULL;