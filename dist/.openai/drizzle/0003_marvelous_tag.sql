CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_account_idx` ON `sessions` (`account_id`);--> statement-breakpoint
CREATE INDEX `sessions_expiry_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
ALTER TABLE `accounts` ADD `username` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `password_hash` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `password_salt` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `role` text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `disabled` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `last_login_at` text;