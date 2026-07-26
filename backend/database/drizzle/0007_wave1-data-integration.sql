CREATE TYPE "public"."email_challenge_delivery_status" AS ENUM('PENDING', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."email_challenge_status" AS ENUM('PENDING', 'RESERVED', 'SUCCEEDED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."auth_challenge_purpose_wave1" AS ENUM('SIGNUP', 'PASSWORD_RESET', 'LOGIN');--> statement-breakpoint
ALTER TYPE "public"."token_occurrence_role" ADD VALUE 'INSTRUCTION';--> statement-breakpoint
ALTER TYPE "public"."question_template" ADD VALUE 'INLINE_SPAN_CHOICE';--> statement-breakpoint
CREATE TABLE "wordbooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(50) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wordbook_items" (
	"wordbook_id" uuid NOT NULL,
	"vocabulary_id" uuid NOT NULL,
	"added_at" timestamp with time zone NOT NULL,
	CONSTRAINT "wordbook_items_pk" PRIMARY KEY("wordbook_id","vocabulary_id")
);
--> statement-breakpoint
ALTER TABLE "auth_challenges" ALTER COLUMN "purpose" TYPE "public"."auth_challenge_purpose_wave1" USING "purpose"::text::"public"."auth_challenge_purpose_wave1";--> statement-breakpoint
DROP TYPE "public"."auth_challenge_purpose";--> statement-breakpoint
ALTER TYPE "public"."auth_challenge_purpose_wave1" RENAME TO "auth_challenge_purpose";--> statement-breakpoint
ALTER TABLE "auth_challenges" ALTER COLUMN "purpose" SET DEFAULT 'LOGIN';--> statement-breakpoint
ALTER TABLE "auth_challenges" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "auth_challenges" ALTER COLUMN "status" SET DATA TYPE "public"."email_challenge_status" USING (
	CASE
		WHEN "status"::text = 'CANCELLED' THEN 'EXPIRED'
		ELSE "status"::text
	END
)::"public"."email_challenge_status";--> statement-breakpoint
ALTER TABLE "auth_challenges" ALTER COLUMN "status" SET DEFAULT 'PENDING';--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD COLUMN "link_hmac" text;--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD COLUMN "resend_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD COLUMN "reserved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD COLUMN "consumed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD COLUMN "delivery_status" "email_challenge_delivery_status" DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
UPDATE "auth_challenges"
SET
	"link_hmac" = 'legacy-unusable:' || "id"::text,
	"resend_at" = "expires_at";--> statement-breakpoint
ALTER TABLE "auth_challenges" ALTER COLUMN "link_hmac" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_challenges" ALTER COLUMN "resend_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "expression_occurrences" ADD COLUMN "meaning_id" uuid;--> statement-breakpoint
ALTER TABLE "expression_occurrences" ADD COLUMN "pronunciation_id" uuid;--> statement-breakpoint
ALTER TABLE "expression_occurrences" ADD COLUMN "context_meaning_ko" text;--> statement-breakpoint
UPDATE "expression_occurrences" AS eo
SET
	"meaning_id" = (
		SELECT vm."id"
		FROM "vocabulary_meanings" AS vm
		WHERE vm."vocabulary_id" = eo."vocabulary_id"
		ORDER BY vm."created_at" ASC, vm."id" ASC
		LIMIT 1
	),
	"context_meaning_ko" = (
		SELECT vm."meaning_ko"
		FROM "vocabulary_meanings" AS vm
		WHERE vm."vocabulary_id" = eo."vocabulary_id"
		ORDER BY vm."created_at" ASC, vm."id" ASC
		LIMIT 1
	),
	"pronunciation_id" = (
		SELECT vp."id"
		FROM "vocabulary_pronunciations" AS vp
		WHERE vp."vocabulary_id" = eo."vocabulary_id"
		ORDER BY vp."created_at" ASC, vp."id" ASC
		LIMIT 1
	);--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "expression_occurrences"
		WHERE "meaning_id" IS NULL
			OR "pronunciation_id" IS NULL
			OR "context_meaning_ko" IS NULL
	) THEN
		RAISE EXCEPTION 'expression occurrence feedback backfill has missing rows';
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "expression_occurrences" ALTER COLUMN "meaning_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "expression_occurrences" ALTER COLUMN "pronunciation_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "expression_occurrences" ALTER COLUMN "context_meaning_ko" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "question_options" ALTER COLUMN "sentence_version_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "question_options" ADD COLUMN "span_sentence_version_id" uuid;--> statement-breakpoint
ALTER TABLE "question_options" ADD COLUMN "span_start_token_index" integer;--> statement-breakpoint
ALTER TABLE "question_options" ADD COLUMN "span_end_token_index" integer;--> statement-breakpoint
ALTER TABLE "wordbooks" ADD CONSTRAINT "wordbooks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wordbook_items" ADD CONSTRAINT "wordbook_items_wordbook_id_wordbooks_id_fk" FOREIGN KEY ("wordbook_id") REFERENCES "public"."wordbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wordbook_items" ADD CONSTRAINT "wordbook_items_vocabulary_id_vocabularies_id_fk" FOREIGN KEY ("vocabulary_id") REFERENCES "public"."vocabularies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wordbooks_user_name_unique" ON "wordbooks" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "wordbook_items_vocabulary_id_idx" ON "wordbook_items" USING btree ("vocabulary_id");--> statement-breakpoint
CREATE INDEX "wordbook_items_page_idx" ON "wordbook_items" USING btree ("wordbook_id","added_at" DESC NULLS LAST,"vocabulary_id");--> statement-breakpoint
ALTER TABLE "expression_occurrences" ADD CONSTRAINT "expression_occurrences_meaning_vocabulary_fk" FOREIGN KEY ("meaning_id","vocabulary_id") REFERENCES "public"."vocabulary_meanings"("id","vocabulary_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expression_occurrences" ADD CONSTRAINT "expression_occurrences_pronunciation_vocabulary_fk" FOREIGN KEY ("pronunciation_id","vocabulary_id") REFERENCES "public"."vocabulary_pronunciations"("id","vocabulary_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_span_sentence_version_id_thai_sentence_versions_id_fk" FOREIGN KEY ("span_sentence_version_id") REFERENCES "public"."thai_sentence_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_sentence_or_span" CHECK (("question_options"."sentence_version_id" is not null and "question_options"."span_sentence_version_id" is null and "question_options"."span_start_token_index" is null and "question_options"."span_end_token_index" is null)
	or ("question_options"."sentence_version_id" is null and "question_options"."span_sentence_version_id" is not null and "question_options"."span_start_token_index" is not null and "question_options"."span_end_token_index" is not null));--> statement-breakpoint
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_span_range" CHECK ("question_options"."span_start_token_index" is null or ("question_options"."span_start_token_index" >= 0 and "question_options"."span_end_token_index" > "question_options"."span_start_token_index"));--> statement-breakpoint
INSERT INTO "wordbooks" ("id", "user_id", "name", "created_at", "updated_at")
SELECT gen_random_uuid(), sv."user_id", '저장한 어휘', min(sv."saved_at"), max(sv."saved_at")
FROM "saved_vocabularies" AS sv
GROUP BY sv."user_id";--> statement-breakpoint
INSERT INTO "wordbook_items" ("wordbook_id", "vocabulary_id", "added_at")
SELECT w."id", sv."vocabulary_id", sv."saved_at"
FROM "saved_vocabularies" AS sv
INNER JOIN "wordbooks" AS w
	ON w."user_id" = sv."user_id"
	AND w."name" = '저장한 어휘';--> statement-breakpoint
DO $$
DECLARE
	legacy_saved_count bigint;
	migrated_item_count bigint;
	missing_item_count bigint;
BEGIN
	SELECT count(*) INTO legacy_saved_count
	FROM "saved_vocabularies";

	SELECT count(*) INTO migrated_item_count
	FROM "saved_vocabularies" AS sv
	INNER JOIN "wordbooks" AS w
		ON w."user_id" = sv."user_id"
		AND w."name" = '저장한 어휘'
	INNER JOIN "wordbook_items" AS wi
		ON wi."wordbook_id" = w."id"
		AND wi."vocabulary_id" = sv."vocabulary_id"
		AND wi."added_at" = sv."saved_at";

	SELECT count(*) INTO missing_item_count
	FROM "saved_vocabularies" AS sv
	LEFT JOIN "wordbooks" AS w
		ON w."user_id" = sv."user_id"
		AND w."name" = '저장한 어휘'
	LEFT JOIN "wordbook_items" AS wi
		ON wi."wordbook_id" = w."id"
		AND wi."vocabulary_id" = sv."vocabulary_id"
		AND wi."added_at" = sv."saved_at"
	WHERE wi."wordbook_id" IS NULL;

	IF migrated_item_count <> legacy_saved_count OR missing_item_count <> 0 THEN
		RAISE EXCEPTION 'saved vocabulary backfill mismatch: legacy %, migrated %, missing %',
			legacy_saved_count,
			migrated_item_count,
			missing_item_count;
	END IF;
END $$;
