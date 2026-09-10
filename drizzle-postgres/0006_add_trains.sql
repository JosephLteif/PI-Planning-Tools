CREATE TABLE "trains" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "train_id" text REFERENCES "public"."trains"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "teams_train_idx" ON "teams" USING btree ("train_id");
