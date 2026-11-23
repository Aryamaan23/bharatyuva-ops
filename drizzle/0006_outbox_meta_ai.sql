CREATE TABLE "app"."ai_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"model" text NOT NULL,
	"prompt_hash" text NOT NULL,
	"output" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."ai_generations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."outbound_messages" ADD COLUMN "meta" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."outbound_messages" ADD COLUMN "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "ai_generations_entity" ON "app"."ai_generations" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE POLICY "ai_generations_staff_select" ON "app"."ai_generations" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_staff());--> statement-breakpoint
GRANT SELECT ON app.ai_generations TO authenticated;
--> statement-breakpoint
GRANT ALL ON app.ai_generations TO service_role;
