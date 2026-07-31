CREATE TABLE "operations_cost_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"warning_usd" numeric(18, 6) DEFAULT '15.000000' NOT NULL,
	"critical_usd" numeric(18, 6) DEFAULT '24.000000' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"last_request_id" uuid,
	"last_request_fingerprint" text,
	CONSTRAINT "operations_cost_settings_singleton" CHECK ("operations_cost_settings"."id" = 1),
	CONSTRAINT "operations_cost_settings_currency_usd" CHECK ("operations_cost_settings"."currency" = 'USD'),
	CONSTRAINT "operations_cost_settings_threshold_order" CHECK ("operations_cost_settings"."warning_usd" > 0 and "operations_cost_settings"."warning_usd" < "operations_cost_settings"."critical_usd")
);
--> statement-breakpoint
ALTER TABLE "operations_cost_settings" ADD CONSTRAINT "operations_cost_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "operations_cost_settings" ("id", "currency", "warning_usd", "critical_usd")
VALUES (1, 'USD', '15.000000', '24.000000');
