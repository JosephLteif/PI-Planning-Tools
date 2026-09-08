CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"username" text,
	"password_hash" text,
	"password_salt" text,
	"role" text DEFAULT 'member' NOT NULL,
	"disabled" integer DEFAULT 0 NOT NULL,
	"last_login_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domains" (
	"room_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "domains_room_id_id_pk" PRIMARY KEY("room_id","id")
);
--> statement-breakpoint
CREATE TABLE "planning_round_participants" (
	"room_id" text NOT NULL,
	"story_key" text NOT NULL,
	"round_number" integer NOT NULL,
	"account_id" text NOT NULL,
	"joined_at" text NOT NULL,
	CONSTRAINT "planning_round_participants_room_id_story_key_round_number_account_id_pk" PRIMARY KEY("room_id","story_key","round_number","account_id")
);
--> statement-breakpoint
CREATE TABLE "planning_rounds" (
	"room_id" text NOT NULL,
	"story_key" text NOT NULL,
	"round_number" integer NOT NULL,
	"phase" text DEFAULT 'idle' NOT NULL,
	"mode" text DEFAULT 'hidden' NOT NULL,
	"submitted_count" integer DEFAULT 0 NOT NULL,
	"revealed_at" text,
	"timer_ends_at" text,
	"timer_started_at" text,
	"updated_at" text NOT NULL,
	CONSTRAINT "planning_rounds_room_id_story_key_round_number_pk" PRIMARY KEY("room_id","story_key","round_number")
);
--> statement-breakpoint
CREATE TABLE "room_invites" (
	"token" text PRIMARY KEY NOT NULL,
	"room_id" text,
	"team_id" text,
	"kind" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"expires_at" text
);
--> statement-breakpoint
CREATE TABLE "room_members" (
	"room_id" text NOT NULL,
	"account_id" text NOT NULL,
	"role" text DEFAULT 'editor' NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "room_members_room_id_account_id_pk" PRIMARY KEY("room_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "room_voting_members" (
	"room_id" text NOT NULL,
	"account_id" text NOT NULL,
	"joined_at" text NOT NULL,
	CONSTRAINT "room_voting_members_room_id_account_id_pk" PRIMARY KEY("room_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"pi_label" text NOT NULL,
	"owner_account_id" text,
	"state_version" integer DEFAULT 0 NOT NULL,
	"sequence_key" text DEFAULT 'fibonacci' NOT NULL,
	"selected_story_key" text,
	"vote_mode" text DEFAULT 'hidden' NOT NULL,
	"ai_enabled" integer DEFAULT 1 NOT NULL,
	"capacity_json" text DEFAULT '{}' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"room_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"domain_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "services_room_id_id_pk" PRIMARY KEY("room_id","id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"expires_at" text NOT NULL,
	"created_at" text NOT NULL,
	"last_seen_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stories" (
	"room_id" text NOT NULL,
	"story_key" text NOT NULL,
	"type" text NOT NULL,
	"epic_id" text,
	"title" text NOT NULL,
	"url" text,
	"description" text NOT NULL,
	"acceptance_json" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"manual_estimate" real,
	"ai_estimate" real,
	"ai_enabled" integer DEFAULT 0 NOT NULL,
	"saved" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "stories_room_id_story_key_pk" PRIMARY KEY("room_id","story_key")
);
--> statement-breakpoint
CREATE TABLE "story_service_allocations" (
	"room_id" text NOT NULL,
	"story_key" text NOT NULL,
	"service_id" text NOT NULL,
	"allocation_pct" real DEFAULT 0 NOT NULL,
	CONSTRAINT "story_service_allocations_room_id_story_key_service_id_pk" PRIMARY KEY("room_id","story_key","service_id")
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"team_id" text NOT NULL,
	"account_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "team_members_team_id_account_id_pk" PRIMARY KEY("team_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_account_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"room_id" text NOT NULL,
	"story_key" text NOT NULL,
	"round_number" integer NOT NULL,
	"account_id" text NOT NULL,
	"manual_estimate" real,
	"ai_estimate" real,
	"ai_enabled" integer DEFAULT 0 NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "votes_room_id_story_key_round_number_account_id_pk" PRIMARY KEY("room_id","story_key","round_number","account_id")
);
--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_round_participants" ADD CONSTRAINT "planning_round_participants_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_round_participants" ADD CONSTRAINT "planning_round_participants_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_rounds" ADD CONSTRAINT "planning_rounds_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_invites" ADD CONSTRAINT "room_invites_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_invites" ADD CONSTRAINT "room_invites_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_invites" ADD CONSTRAINT "room_invites_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_voting_members" ADD CONSTRAINT "room_voting_members_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_voting_members" ADD CONSTRAINT "room_voting_members_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_owner_account_id_accounts_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_service_allocations" ADD CONSTRAINT "story_service_allocations_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_owner_account_id_accounts_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_username_idx" ON "accounts" USING btree ("username");--> statement-breakpoint
CREATE INDEX "participants_round_idx" ON "planning_round_participants" USING btree ("room_id","story_key","round_number");--> statement-breakpoint
CREATE INDEX "rounds_order_idx" ON "planning_rounds" USING btree ("room_id","story_key","round_number");--> statement-breakpoint
CREATE INDEX "room_invites_room_idx" ON "room_invites" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "room_invites_team_idx" ON "room_invites" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "room_voting_members_room_idx" ON "room_voting_members" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "sessions_account_idx" ON "sessions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "stories_order_idx" ON "stories" USING btree ("room_id","sort_order");--> statement-breakpoint
CREATE INDEX "stories_epic_idx" ON "stories" USING btree ("room_id","epic_id");--> statement-breakpoint
CREATE INDEX "votes_round_idx" ON "votes" USING btree ("room_id","story_key","round_number");