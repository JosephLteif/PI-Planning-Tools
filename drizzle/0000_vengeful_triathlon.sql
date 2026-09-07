CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `domains` (
	`room_id` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`room_id`, `id`),
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `planning_rounds` (
	`room_id` text NOT NULL,
	`story_key` text NOT NULL,
	`round_number` integer NOT NULL,
	`phase` text DEFAULT 'idle' NOT NULL,
	`mode` text DEFAULT 'hidden' NOT NULL,
	`submitted_count` integer DEFAULT 0 NOT NULL,
	`revealed_at` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`room_id`, `story_key`, `round_number`),
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rounds_order_idx` ON `planning_rounds` (`room_id`,`story_key`,`round_number`);--> statement-breakpoint
CREATE TABLE `room_members` (
	`room_id` text NOT NULL,
	`account_id` text NOT NULL,
	`role` text DEFAULT 'editor' NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`room_id`, `account_id`),
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`pi_label` text NOT NULL,
	`sequence_key` text DEFAULT 'fibonacci' NOT NULL,
	`selected_story_key` text,
	`vote_mode` text DEFAULT 'hidden' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `services` (
	`room_id` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`domain_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`room_id`, `id`),
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `stories` (
	`room_id` text NOT NULL,
	`story_key` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`acceptance_json` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`manual_estimate` real,
	`ai_estimate` real,
	`ai_enabled` integer DEFAULT 0 NOT NULL,
	`saved` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`room_id`, `story_key`),
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `stories_order_idx` ON `stories` (`room_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `story_service_allocations` (
	`room_id` text NOT NULL,
	`story_key` text NOT NULL,
	`service_id` text NOT NULL,
	`allocation_pct` real DEFAULT 0 NOT NULL,
	PRIMARY KEY(`room_id`, `story_key`, `service_id`),
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `votes` (
	`room_id` text NOT NULL,
	`story_key` text NOT NULL,
	`round_number` integer NOT NULL,
	`account_id` text NOT NULL,
	`manual_estimate` real,
	`ai_estimate` real,
	`ai_enabled` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`room_id`, `story_key`, `round_number`, `account_id`),
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `votes_round_idx` ON `votes` (`room_id`,`story_key`,`round_number`);