CREATE TYPE "public"."broker" AS ENUM('INTERACTIVE_BROKERS', 'FREEDOM_FINANCE');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('TRADE', 'DIVIDEND', 'INTEREST', 'FEE', 'WITHHOLDING_TAX', 'FX_CONVERSION', 'CASH_TRANSFER', 'CORPORATE_ACTION', 'POSITION_SNAPSHOT');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broker_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"broker" "broker" NOT NULL,
	"account_number" text NOT NULL,
	"base_currency" text DEFAULT 'EUR' NOT NULL,
	"display_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"date" text NOT NULL,
	"from_currency" text NOT NULL,
	"to_currency" text DEFAULT 'EUR' NOT NULL,
	"rate" numeric NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"broker_account_id" uuid,
	"broker" "broker" NOT NULL,
	"file_name" text NOT NULL,
	"file_hash" text NOT NULL,
	"tax_year" integer NOT NULL,
	"event_count" integer NOT NULL,
	"inserted_event_count" integer DEFAULT 0 NOT NULL,
	"duplicate_event_count" integer DEFAULT 0 NOT NULL,
	"statement_start_date" text,
	"statement_end_date" text,
	"status" text DEFAULT 'PARSED' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instruments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"symbol" text,
	"isin" text,
	"name" text,
	"currency" text
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"owner_user_id" text NOT NULL,
	"broker_account_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"isin" text,
	"currency" text NOT NULL,
	"quantity" numeric NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "positions_owner_user_id_broker_account_id_symbol_currency_pk" PRIMARY KEY("owner_user_id","broker_account_id","symbol","currency")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "tax_report_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"tax_report_id" uuid NOT NULL,
	"line_key" text NOT NULL,
	"amount" numeric NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"tax_year" integer NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"import_id" uuid,
	"broker_account_id" uuid,
	"broker" "broker" NOT NULL,
	"account_number" text NOT NULL,
	"event_fingerprint" text NOT NULL,
	"event_type" "event_type" NOT NULL,
	"event_date" text NOT NULL,
	"currency" text NOT NULL,
	"symbol" text,
	"isin" text,
	"quantity" numeric,
	"price" numeric,
	"amount" numeric,
	"amount_eur" numeric,
	"cash_amount" numeric,
	"cash_amount_eur" numeric,
	"proceeds" numeric,
	"proceeds_eur" numeric,
	"fee" numeric,
	"fee_eur" numeric,
	"realized_pnl" numeric,
	"realized_pnl_eur" numeric,
	"withholding_tax" numeric,
	"withholding_tax_eur" numeric,
	"fx_source" text,
	"requires_review" boolean DEFAULT false NOT NULL,
	"reviewed_at" timestamp,
	"reviewed_by_user_id" text,
	"review_note" text,
	"description" text,
	"source" text,
	"raw" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broker_accounts" ADD CONSTRAINT "broker_accounts_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fx_rates" ADD CONSTRAINT "fx_rates_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_broker_account_id_broker_accounts_id_fk" FOREIGN KEY ("broker_account_id") REFERENCES "public"."broker_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instruments" ADD CONSTRAINT "instruments_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_broker_account_id_broker_accounts_id_fk" FOREIGN KEY ("broker_account_id") REFERENCES "public"."broker_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_report_lines" ADD CONSTRAINT "tax_report_lines_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_report_lines" ADD CONSTRAINT "tax_report_lines_tax_report_id_tax_reports_id_fk" FOREIGN KEY ("tax_report_id") REFERENCES "public"."tax_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_reports" ADD CONSTRAINT "tax_reports_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_broker_account_id_broker_accounts_id_fk" FOREIGN KEY ("broker_account_id") REFERENCES "public"."broker_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_reviewed_by_user_id_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "broker_accounts_owner_account_unique" ON "broker_accounts" USING btree ("owner_user_id","broker","account_number");--> statement-breakpoint
CREATE UNIQUE INDEX "fx_rates_owner_pair_date_unique" ON "fx_rates" USING btree ("owner_user_id","date","from_currency","to_currency");--> statement-breakpoint
CREATE UNIQUE INDEX "imports_owner_hash_unique" ON "imports" USING btree ("owner_user_id","file_hash");--> statement-breakpoint
CREATE INDEX "instruments_owner_isin_idx" ON "instruments" USING btree ("owner_user_id","isin");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_report_lines_report_line_unique" ON "tax_report_lines" USING btree ("tax_report_id","line_key");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_reports_owner_year_unique" ON "tax_reports" USING btree ("owner_user_id","tax_year");--> statement-breakpoint
CREATE INDEX "transactions_owner_date_idx" ON "transactions" USING btree ("owner_user_id","event_date");--> statement-breakpoint
CREATE INDEX "transactions_owner_account_idx" ON "transactions" USING btree ("owner_user_id","broker_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_owner_account_fingerprint_unique" ON "transactions" USING btree ("owner_user_id","broker_account_id","event_fingerprint");
