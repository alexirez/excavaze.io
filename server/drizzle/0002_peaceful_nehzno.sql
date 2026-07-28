CREATE TABLE "player_quests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"quest_id" text NOT NULL,
	"status" varchar(16) NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "last_connected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "quests_generated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "player_quests" ADD CONSTRAINT "player_quests_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "player_quests_player_id_idx" ON "player_quests" USING btree ("player_id");