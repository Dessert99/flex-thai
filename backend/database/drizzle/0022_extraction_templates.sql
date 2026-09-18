CREATE TABLE "extraction_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"description" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "extraction_templates_description_length" CHECK (char_length(trim("extraction_templates"."description")) between 1 and 120),
	CONSTRAINT "extraction_templates_body_length" CHECK (char_length(trim("extraction_templates"."body")) between 1 and 20000)
);
