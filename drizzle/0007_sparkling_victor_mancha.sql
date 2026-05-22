CREATE TABLE IF NOT EXISTS "crypto_daily_values" (
	"owner_user_id" text NOT NULL,
	"date" text NOT NULL,
	"symbol" text NOT NULL,
	"quantity" numeric NOT NULL,
	"price_eur" numeric NOT NULL,
	"value_eur" numeric NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crypto_daily_values_owner_user_id_date_symbol_pk" PRIMARY KEY("owner_user_id","date","symbol")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crypto_daily_values" ADD CONSTRAINT "crypto_daily_values_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crypto_daily_values_owner_date_idx" ON "crypto_daily_values" USING btree ("owner_user_id","date");