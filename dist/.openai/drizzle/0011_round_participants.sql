CREATE TABLE `planning_round_participants` (
	`room_id` text NOT NULL,
	`story_key` text NOT NULL,
	`round_number` integer NOT NULL,
	`account_id` text NOT NULL,
	`joined_at` text NOT NULL,
	PRIMARY KEY(`room_id`, `story_key`, `round_number`, `account_id`),
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `participants_round_idx` ON `planning_round_participants` (`room_id`,`story_key`,`round_number`);
--> statement-breakpoint
INSERT OR IGNORE INTO `planning_round_participants` (`room_id`, `story_key`, `round_number`, `account_id`, `joined_at`)
SELECT `room_id`, `story_key`, `round_number`, `account_id`, `updated_at`
FROM `votes`
WHERE `manual_estimate` IS NOT NULL OR `ai_estimate` IS NOT NULL;
