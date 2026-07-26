CREATE TYPE "public"."content_error_report_category" AS ENUM('MEANING_TRANSLATION', 'PRONUNCIATION_TONE', 'AUDIO', 'ANSWER_EXPLANATION', 'TOKENIZATION', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."content_error_report_history_action" AS ENUM('SUBMITTED', 'STATUS_CHANGED', 'ASSIGNEE_CHANGED');--> statement-breakpoint
CREATE TYPE "public"."content_error_report_status" AS ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."content_error_report_target_kind" AS ENUM('QUESTION', 'VOCABULARY', 'SENTENCE', 'AUDIO', 'CONCEPT');--> statement-breakpoint
CREATE TABLE "content_error_report_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"action" "content_error_report_history_action" NOT NULL,
	"from_status" "content_error_report_status",
	"to_status" "content_error_report_status",
	"from_assignee_user_id" uuid,
	"to_assignee_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_error_report_history_action_payload" CHECK (
        (
          "content_error_report_history"."action" = 'SUBMITTED'
          and "content_error_report_history"."from_status" is null
          and "content_error_report_history"."to_status" is null
          and "content_error_report_history"."from_assignee_user_id" is null
          and "content_error_report_history"."to_assignee_user_id" is null
        )
        or (
          "content_error_report_history"."action" = 'STATUS_CHANGED'
          and "content_error_report_history"."from_status" is not null
          and "content_error_report_history"."to_status" is not null
          and "content_error_report_history"."from_status" <> "content_error_report_history"."to_status"
          and "content_error_report_history"."from_assignee_user_id" is null
          and "content_error_report_history"."to_assignee_user_id" is null
        )
        or (
          "content_error_report_history"."action" = 'ASSIGNEE_CHANGED'
          and "content_error_report_history"."from_status" is null
          and "content_error_report_history"."to_status" is null
          and "content_error_report_history"."from_assignee_user_id" is distinct from "content_error_report_history"."to_assignee_user_id"
          and ("content_error_report_history"."from_assignee_user_id" is not null or "content_error_report_history"."to_assignee_user_id" is not null)
        )
      )
);
--> statement-breakpoint
CREATE TABLE "content_error_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_user_id" uuid NOT NULL,
	"target_kind" "content_error_report_target_kind" NOT NULL,
	"category" "content_error_report_category" NOT NULL,
	"status" "content_error_report_status" DEFAULT 'OPEN' NOT NULL,
	"assignee_user_id" uuid,
	"description" varchar(1000),
	"canonical_reference" jsonb NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_error_report_history" ADD CONSTRAINT "content_error_report_history_report_id_content_error_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."content_error_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_error_report_history" ADD CONSTRAINT "content_error_report_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_error_report_history" ADD CONSTRAINT "content_error_report_history_from_assignee_user_id_users_id_fk" FOREIGN KEY ("from_assignee_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_error_report_history" ADD CONSTRAINT "content_error_report_history_to_assignee_user_id_users_id_fk" FOREIGN KEY ("to_assignee_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_error_reports" ADD CONSTRAINT "content_error_reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_error_reports" ADD CONSTRAINT "content_error_reports_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_error_report_history_report_time_idx" ON "content_error_report_history" USING btree ("report_id","created_at","id");--> statement-breakpoint
CREATE INDEX "content_error_reports_status_page_idx" ON "content_error_reports" USING btree ("status","created_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "content_error_reports_assignee_status_page_idx" ON "content_error_reports" USING btree ("assignee_user_id","status","created_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "content_error_reports_target_page_idx" ON "content_error_reports" USING btree ("target_kind","created_at" DESC NULLS LAST,"id");