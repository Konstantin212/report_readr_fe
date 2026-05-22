CREATE TABLE IF NOT EXISTS "crypto_wallets" (
	"owner_user_id" text NOT NULL,
	"crypto_account_id" uuid NOT NULL,
	"wallet_id" text NOT NULL,
	"symbol" text NOT NULL,
	"name" text,
	"quantity" numeric NOT NULL,
	"native_amount" numeric NOT NULL,
	"native_currency" text DEFAULT 'EUR' NOT NULL,
	"primary" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crypto_wallets_crypto_account_id_wallet_id_pk" PRIMARY KEY("crypto_account_id","wallet_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crypto_wallets" ADD CONSTRAINT "crypto_wallets_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crypto_wallets" ADD CONSTRAINT "crypto_wallets_crypto_account_id_crypto_accounts_id_fk" FOREIGN KEY ("crypto_account_id") REFERENCES "public"."crypto_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crypto_wallets_owner_idx" ON "crypto_wallets" USING btree ("owner_user_id");