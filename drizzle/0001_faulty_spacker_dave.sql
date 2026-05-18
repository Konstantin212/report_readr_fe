CREATE TABLE IF NOT EXISTS "lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"broker_account_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"opened_at" text NOT NULL,
	"remaining_qty" numeric NOT NULL,
	"cost_eur" numeric NOT NULL,
	"source_event_fingerprint" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quote_cache" (
	"symbol" text NOT NULL,
	"date" text NOT NULL,
	"currency" text NOT NULL,
	"close" numeric NOT NULL,
	"source" text DEFAULT 'YAHOO' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "quote_cache_symbol_date_pk" PRIMARY KEY("symbol","date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "realized_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"broker_account_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"opening_fingerprint" text NOT NULL,
	"closing_fingerprint" text NOT NULL,
	"qty" numeric NOT NULL,
	"cost_eur" numeric NOT NULL,
	"proceeds_eur" numeric NOT NULL,
	"gain_eur" numeric NOT NULL,
	"holding_days" integer NOT NULL,
	"is_long_term" boolean NOT NULL,
	"closed_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_settings" (
	"owner_user_id" text PRIMARY KEY NOT NULL,
	"filing_status" text DEFAULT 'SINGLE' NOT NULL,
	"jurisdiction" text DEFAULT 'DE' NOT NULL,
	"saver_allowance" numeric DEFAULT '1000' NOT NULL,
	"lot_method" text DEFAULT 'FIFO' NOT NULL,
	"fx_source" text DEFAULT 'ECB' NOT NULL,
	"accent_palette" jsonb DEFAULT '["#7CFFB2","#FFD24A","#FF5DA2"]'::jsonb NOT NULL,
	"hide_values" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fx_rates" DROP CONSTRAINT "fx_rates_owner_user_id_user_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "fx_rates_owner_pair_date_unique";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lots" ADD CONSTRAINT "lots_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lots" ADD CONSTRAINT "lots_broker_account_id_broker_accounts_id_fk" FOREIGN KEY ("broker_account_id") REFERENCES "public"."broker_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "realized_matches" ADD CONSTRAINT "realized_matches_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "realized_matches" ADD CONSTRAINT "realized_matches_broker_account_id_broker_accounts_id_fk" FOREIGN KEY ("broker_account_id") REFERENCES "public"."broker_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lots_owner_acct_symbol_idx" ON "lots" USING btree ("owner_user_id","broker_account_id","symbol");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "realized_matches_owner_closed_idx" ON "realized_matches" USING btree ("owner_user_id","closed_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fx_rates_pair_date_unique" ON "fx_rates" USING btree ("date","from_currency","to_currency");--> statement-breakpoint
ALTER TABLE "fx_rates" DROP COLUMN IF EXISTS "owner_user_id";