CREATE TYPE "public"."concept_block_kind" AS ENUM('EXPLANATION', 'RULE_TABLE', 'THAI_EXAMPLES');--> statement-breakpoint
CREATE TYPE "public"."concept_category" AS ENUM('THAI_SCRIPT_PRONUNCIATION', 'GRAMMAR');--> statement-breakpoint
CREATE TYPE "public"."concept_status" AS ENUM('DRAFT', 'PUBLISHED', 'HIDDEN');--> statement-breakpoint
CREATE TYPE "public"."concept_validation_status" AS ENUM('PENDING', 'PASSED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."concept_version_status" AS ENUM('DRAFT', 'PUBLISHED', 'RETIRED');--> statement-breakpoint
CREATE TABLE "concept_block_examples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"sentence_version_id" uuid NOT NULL,
	"note_ko" text,
	CONSTRAINT "concept_block_examples_position_nonnegative" CHECK ("concept_block_examples"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "concept_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"concept_version_id" uuid NOT NULL,
	"kind" "concept_block_kind" NOT NULL,
	"position" integer NOT NULL,
	"heading" text NOT NULL,
	"paragraphs" jsonb,
	"table_headers" jsonb,
	"table_rows" jsonb,
	CONSTRAINT "concept_blocks_position_nonnegative" CHECK ("concept_blocks"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "concept_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"concept_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"category" "concept_category" NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"status" "concept_version_status" DEFAULT 'DRAFT' NOT NULL,
	"validation_status" "concept_validation_status" DEFAULT 'PENDING' NOT NULL,
	"validation_issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"validated_revision" integer,
	"validated_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "concept_versions_concept_id_id_unique" UNIQUE("concept_id","id"),
	CONSTRAINT "concept_versions_version_positive" CHECK ("concept_versions"."version" > 0),
	CONSTRAINT "concept_versions_revision_nonnegative" CHECK ("concept_versions"."revision" >= 0),
	CONSTRAINT "concept_versions_position_nonnegative" CHECK ("concept_versions"."position" >= 0),
	CONSTRAINT "concept_versions_validation_consistent" CHECK (("concept_versions"."validation_status" = 'PENDING' and "concept_versions"."validated_revision" is null and "concept_versions"."validated_at" is null and jsonb_array_length("concept_versions"."validation_issues") = 0)
        or ("concept_versions"."validation_status" = 'PASSED' and "concept_versions"."validated_revision" is not null and "concept_versions"."validated_at" is not null and jsonb_array_length("concept_versions"."validation_issues") = 0)
        or ("concept_versions"."validation_status" = 'FAILED' and "concept_versions"."validated_revision" is not null and "concept_versions"."validated_at" is not null and jsonb_array_length("concept_versions"."validation_issues") > 0)),
	CONSTRAINT "concept_versions_publication_consistent" CHECK (("concept_versions"."status" = 'DRAFT' and "concept_versions"."published_at" is null)
        or ("concept_versions"."status" in ('PUBLISHED', 'RETIRED') and "concept_versions"."published_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "concepts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "concept_status" DEFAULT 'DRAFT' NOT NULL,
	"current_published_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "concept_block_examples" ADD CONSTRAINT "concept_block_examples_block_id_concept_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."concept_blocks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_block_examples" ADD CONSTRAINT "concept_block_examples_sentence_version_id_thai_sentence_versions_id_fk" FOREIGN KEY ("sentence_version_id") REFERENCES "public"."thai_sentence_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_blocks" ADD CONSTRAINT "concept_blocks_concept_version_id_concept_versions_id_fk" FOREIGN KEY ("concept_version_id") REFERENCES "public"."concept_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_versions" ADD CONSTRAINT "concept_versions_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_current_published_version_fk" FOREIGN KEY ("id","current_published_version_id") REFERENCES "public"."concept_versions"("concept_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "concept_block_examples_block_position_unique" ON "concept_block_examples" USING btree ("block_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "concept_block_examples_block_sentence_unique" ON "concept_block_examples" USING btree ("block_id","sentence_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "concept_blocks_version_position_unique" ON "concept_blocks" USING btree ("concept_version_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "concept_versions_concept_version_unique" ON "concept_versions" USING btree ("concept_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "concept_versions_single_draft_unique" ON "concept_versions" USING btree ("concept_id") WHERE "concept_versions"."status" = 'DRAFT';