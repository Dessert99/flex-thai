CREATE TYPE "public"."content_import_item_kind" AS ENUM('VOCABULARY', 'QUESTION');--> statement-breakpoint
CREATE TYPE "public"."content_import_item_status" AS ENUM('IMPORTED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."content_import_status" AS ENUM('COMPLETED', 'COMPLETED_WITH_FAILURES');--> statement-breakpoint
CREATE TABLE "content_import_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"kind" "content_import_item_kind" NOT NULL,
	"source_index" integer NOT NULL,
	"client_ref" text NOT NULL,
	"status" "content_import_item_status" NOT NULL,
	"target_id" uuid,
	"errors" jsonb NOT NULL,
	"reference_map" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_import_items_source_index_nonnegative" CHECK ("content_import_items"."source_index" >= 0),
	CONSTRAINT "content_import_items_client_ref_nonempty" CHECK (char_length("content_import_items"."client_ref") > 0),
	CONSTRAINT "content_import_items_errors_shape" CHECK (jsonb_typeof("content_import_items"."errors") = 'array' and not coalesce("content_import_items"."errors" @? '$[*] ? (@.type() != "object")', true) and not coalesce("content_import_items"."errors" @? '$[*] ? (!exists(@.path) || @.path.type() != "string" || !exists(@.code) || @.code.type() != "string" || @.code == "")', true) and not coalesce("content_import_items"."errors" @? '$[*].keyvalue() ? (@.key != "path" && @.key != "code")', true)),
	CONSTRAINT "content_import_items_reference_map_shape" CHECK (jsonb_typeof("content_import_items"."reference_map") = 'object' and not coalesce("content_import_items"."reference_map" @? '$.keyvalue() ? (@.key == "" || @.value.type() != "string" || !(@.value like_regex "^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$"))', true)),
	CONSTRAINT "content_import_items_result_consistency" CHECK (("content_import_items"."status" = 'IMPORTED' and "content_import_items"."target_id" is not null and jsonb_array_length("content_import_items"."errors") = 0 and "content_import_items"."reference_map" <> '{}'::jsonb) or ("content_import_items"."status" = 'REJECTED' and "content_import_items"."target_id" is null and jsonb_array_length("content_import_items"."errors") > 0 and "content_import_items"."reference_map" = '{}'::jsonb))
);
--> statement-breakpoint
CREATE TABLE "content_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requested_by" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"status" "content_import_status",
	"vocabulary_count" integer NOT NULL,
	"question_count" integer NOT NULL,
	"imported_count" integer DEFAULT 0 NOT NULL,
	"rejected_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "content_imports_request_hash_sha256" CHECK ("content_imports"."request_hash" ~ '^[0-9A-Fa-f]{64}$'),
	CONSTRAINT "content_imports_counts_nonnegative" CHECK ("content_imports"."vocabulary_count" >= 0 and "content_imports"."question_count" >= 0 and "content_imports"."imported_count" >= 0 and "content_imports"."rejected_count" >= 0),
	CONSTRAINT "content_imports_total_count_range" CHECK ("content_imports"."vocabulary_count" + "content_imports"."question_count" between 1 and 100),
	CONSTRAINT "content_imports_processed_count_consistency" CHECK ("content_imports"."imported_count" + "content_imports"."rejected_count" <= "content_imports"."vocabulary_count" + "content_imports"."question_count"),
	CONSTRAINT "content_imports_status_completion_consistency" CHECK (("content_imports"."status" is null and "content_imports"."completed_at" is null) or ("content_imports"."status" is not null and "content_imports"."completed_at" is not null)),
	CONSTRAINT "content_imports_final_status_result_consistency" CHECK ("content_imports"."status" is null or ("content_imports"."status" = 'COMPLETED' and "content_imports"."rejected_count" = 0 and "content_imports"."imported_count" + "content_imports"."rejected_count" = "content_imports"."vocabulary_count" + "content_imports"."question_count") or ("content_imports"."status" = 'COMPLETED_WITH_FAILURES' and "content_imports"."rejected_count" > 0 and "content_imports"."imported_count" + "content_imports"."rejected_count" = "content_imports"."vocabulary_count" + "content_imports"."question_count"))
);
--> statement-breakpoint
ALTER TABLE "content_import_items" ADD CONSTRAINT "content_import_items_import_id_content_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."content_imports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_imports" ADD CONSTRAINT "content_imports_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_import_items_import_kind_source_index_unique" ON "content_import_items" USING btree ("import_id","kind","source_index");--> statement-breakpoint
CREATE UNIQUE INDEX "content_imports_requested_by_idempotency_key_unique" ON "content_imports" USING btree ("requested_by","idempotency_key");