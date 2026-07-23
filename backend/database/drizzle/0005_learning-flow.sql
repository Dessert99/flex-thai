CREATE TABLE "question_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"question_version_id" uuid NOT NULL,
	"attempt_no" integer NOT NULL,
	"selected_option_id" uuid NOT NULL,
	"client_attempt_id" uuid NOT NULL,
	"duration_ms" bigint NOT NULL,
	"is_correct" boolean NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	CONSTRAINT "question_attempts_attempt_no_positive" CHECK ("question_attempts"."attempt_no" > 0),
	CONSTRAINT "question_attempts_duration_ms_safe_integer" CHECK ("question_attempts"."duration_ms" >= 0 and "question_attempts"."duration_ms" <= 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE "saved_questions" (
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"saved_at" timestamp with time zone NOT NULL,
	CONSTRAINT "saved_questions_pk" PRIMARY KEY("user_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "saved_vocabularies" (
	"user_id" uuid NOT NULL,
	"vocabulary_id" uuid NOT NULL,
	"saved_at" timestamp with time zone NOT NULL,
	CONSTRAINT "saved_vocabularies_pk" PRIMARY KEY("user_id","vocabulary_id")
);
--> statement-breakpoint
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_question_version_fk" FOREIGN KEY ("question_id","question_version_id") REFERENCES "public"."question_versions"("question_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_selected_option_fk" FOREIGN KEY ("question_version_id","selected_option_id") REFERENCES "public"."question_options"("question_version_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_questions" ADD CONSTRAINT "saved_questions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_questions" ADD CONSTRAINT "saved_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_vocabularies" ADD CONSTRAINT "saved_vocabularies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_vocabularies" ADD CONSTRAINT "saved_vocabularies_vocabulary_id_vocabularies_id_fk" FOREIGN KEY ("vocabulary_id") REFERENCES "public"."vocabularies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "question_attempts_user_question_attempt_unique" ON "question_attempts" USING btree ("user_id","question_id","attempt_no");--> statement-breakpoint
CREATE UNIQUE INDEX "question_attempts_user_client_attempt_unique" ON "question_attempts" USING btree ("user_id","client_attempt_id");--> statement-breakpoint
CREATE INDEX "question_attempts_user_submitted_at_idx" ON "question_attempts" USING btree ("user_id","submitted_at");--> statement-breakpoint
CREATE INDEX "saved_questions_question_id_idx" ON "saved_questions" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "saved_vocabularies_vocabulary_id_idx" ON "saved_vocabularies" USING btree ("vocabulary_id");