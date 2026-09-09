ALTER TABLE "team_members" ALTER COLUMN "role" SET DEFAULT 'developer';--> statement-breakpoint
UPDATE "team_members" SET "role" = 'developer' WHERE "role" = 'member';--> statement-breakpoint
UPDATE "team_members" SET "role" = 'observer'
WHERE "role" = 'developer'
  AND EXISTS (
    SELECT 1 FROM "room_members"
    WHERE "room_members"."account_id" = "team_members"."account_id"
      AND "room_members"."role" = 'observer'
  );
