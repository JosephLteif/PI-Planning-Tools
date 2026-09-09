ALTER TABLE `team_members` RENAME TO `team_members_legacy`;
--> statement-breakpoint
CREATE TABLE `team_members` (
	`team_id` text NOT NULL,
	`account_id` text NOT NULL,
	`role` text DEFAULT 'developer' NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`team_id`, `account_id`),
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `team_members` (`team_id`, `account_id`, `role`, `created_at`)
SELECT `team_id`, `account_id`, CASE WHEN `role` = 'observer' THEN 'observer' WHEN `role` = 'owner' THEN 'owner' ELSE 'developer' END, `created_at`
FROM `team_members_legacy`;
--> statement-breakpoint
UPDATE `team_members`
SET `role` = 'observer'
WHERE `role` = 'developer'
  AND EXISTS (
    SELECT 1 FROM `room_members`
    WHERE `room_members`.`account_id` = `team_members`.`account_id`
      AND `room_members`.`role` = 'observer'
  );
--> statement-breakpoint
DROP TABLE `team_members_legacy`;
