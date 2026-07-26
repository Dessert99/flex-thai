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
ALTER TABLE "wordbooks" ADD CONSTRAINT "wordbooks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wordbook_items" ADD CONSTRAINT "wordbook_items_wordbook_id_wordbooks_id_fk" FOREIGN KEY ("wordbook_id") REFERENCES "public"."wordbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wordbook_items" ADD CONSTRAINT "wordbook_items_vocabulary_id_vocabularies_id_fk" FOREIGN KEY ("vocabulary_id") REFERENCES "public"."vocabularies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wordbooks_user_name_unique" ON "wordbooks" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "wordbook_items_vocabulary_id_idx" ON "wordbook_items" USING btree ("vocabulary_id");--> statement-breakpoint
CREATE INDEX "wordbook_items_page_idx" ON "wordbook_items" USING btree ("wordbook_id","added_at" DESC NULLS LAST,"vocabulary_id");--> statement-breakpoint
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
