DROP TABLE "saved_vocabularies";--> statement-breakpoint
DROP TABLE "expression_occurrences";--> statement-breakpoint
DROP TABLE "token_occurrences";--> statement-breakpoint
DROP TABLE "thai_sentence_versions";--> statement-breakpoint
DROP TABLE "thai_sentences";--> statement-breakpoint
DROP TABLE "vocabulary_merge_history";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "phone_verified_at";--> statement-breakpoint
DROP TYPE "public"."token_occurrence_role";
