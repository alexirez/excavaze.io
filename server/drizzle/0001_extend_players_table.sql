ALTER TABLE "players" RENAME COLUMN "gem_balance" TO "gems";--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "guest_token" text;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "purchased_upgrades" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_guest_token_unique" UNIQUE("guest_token");