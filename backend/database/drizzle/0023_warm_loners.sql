CREATE TABLE "vocabulary_extraction_chunks" (
	"job_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "vocabulary_extraction_chunks_job_id_ordinal_pk" PRIMARY KEY("job_id","ordinal")
);
--> statement-breakpoint
CREATE TABLE "vocabulary_extraction_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"source_name" text NOT NULL,
	"source" jsonb NOT NULL,
	"prompt" text NOT NULL,
	"config" jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"stage" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"completed" integer DEFAULT 0 NOT NULL,
	"compared" integer DEFAULT 0 NOT NULL,
	"error" text,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vocabulary_extraction_chunks" ADD CONSTRAINT "vocabulary_extraction_chunks_job_id_vocabulary_extraction_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."vocabulary_extraction_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "extraction_owner_request" ON "vocabulary_extraction_jobs" USING btree ("owner_id","request_id");--> statement-breakpoint
CREATE INDEX "extraction_queue" ON "vocabulary_extraction_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "extraction_owner_created" ON "vocabulary_extraction_jobs" USING btree ("owner_id","created_at");