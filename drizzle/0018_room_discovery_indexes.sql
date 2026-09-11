CREATE INDEX IF NOT EXISTS `rooms_updated_at_idx` ON `rooms` (`updated_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `room_members_account_idx` ON `room_members` (`account_id`);
