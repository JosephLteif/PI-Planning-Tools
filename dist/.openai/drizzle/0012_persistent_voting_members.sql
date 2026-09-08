ALTER TABLE `stories` ADD `url` text;
--> statement-breakpoint
CREATE TABLE `room_voting_members` (
	`room_id` text NOT NULL,
	`account_id` text NOT NULL,
	`joined_at` text NOT NULL,
	PRIMARY KEY(`room_id`, `account_id`),
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `room_voting_members_room_idx` ON `room_voting_members` (`room_id`);
--> statement-breakpoint
INSERT OR IGNORE INTO `room_voting_members` (`room_id`, `account_id`, `joined_at`)
SELECT `room_id`, `account_id`, MIN(`joined_at`)
FROM `planning_round_participants`
GROUP BY `room_id`, `account_id`;
