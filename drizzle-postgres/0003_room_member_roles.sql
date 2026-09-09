ALTER TABLE "room_members" ALTER COLUMN "role" SET DEFAULT 'developer';--> statement-breakpoint
UPDATE "room_members" SET "role" = 'developer' WHERE "role" = 'editor';
