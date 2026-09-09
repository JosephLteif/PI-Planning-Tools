ALTER TABLE `room_members` RENAME TO `room_members_legacy`;
--> statement-breakpoint
CREATE TABLE `room_members` (
	`room_id` text NOT NULL,
	`account_id` text NOT NULL,
	`role` text DEFAULT 'developer' NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`room_id`, `account_id`),
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `room_members` (`room_id`, `account_id`, `role`, `created_at`)
SELECT `room_id`, `account_id`, CASE WHEN `role` = 'observer' THEN 'observer' WHEN `role` = 'owner' THEN 'owner' ELSE 'developer' END, `created_at`
FROM `room_members_legacy`;
--> statement-breakpoint
DROP TABLE `room_members_legacy`;
