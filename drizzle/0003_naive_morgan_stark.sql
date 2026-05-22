CREATE TABLE IF NOT EXISTS "crypto_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"exchange" text NOT NULL,
	"label" text,
	"api_key_ciphertext" text NOT NULL,
	"api_key_iv" text NOT NULL,
	"api_secret_ciphertext" text NOT NULL,
	"api_secret_iv" text NOT NULL,
	"scopes" text NOT NULL,
	"exchange_user_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_sync_at" timestamp,
	"last_sync_error" text,
	"last_sync_event_count" integer DEFAULT 0 NOT NULL,
	"last_sync_cursor" text,
	"connected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crypto_accounts" ADD CONSTRAINT "crypto_accounts_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crypto_accounts_owner_exchange_user_unique" ON "crypto_accounts" USING btree ("owner_user_id","exchange","exchange_user_id");