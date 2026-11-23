CREATE TYPE "app"."contact_channel" AS ENUM('email', 'form', 'phone');--> statement-breakpoint
CREATE TYPE "app"."gmail_status" AS ENUM('active', 'revoked', 'error');--> statement-breakpoint
CREATE TYPE "app"."partner_stage" AS ENUM('not_contacted', 'email_sent', 'follow_up_1', 'follow_up_2', 'in_discussion', 'confirmed', 'declined', 'do_not_contact');--> statement-breakpoint
CREATE TYPE "app"."partner_type" AS ENUM('university', 'district', 'embassy', 'other');--> statement-breakpoint
CREATE TYPE "app"."sequence_step_kind" AS ENUM('first', 'fu1', 'fu2', 'call');--> statement-breakpoint
CREATE TYPE "app"."sequence_step_status" AS ENUM('pending', 'queued', 'sent', 'done', 'skipped', 'stopped');--> statement-breakpoint
CREATE TYPE "app"."task_kind" AS ENUM('timeline', 'outreach_call', 'manual_contact', 'bounce', 'partner_request', 'other');--> statement-breakpoint
CREATE TYPE "app"."task_status" AS ENUM('open', 'done', 'skipped');--> statement-breakpoint
CREATE TYPE "app"."temperature" AS ENUM('hot', 'warm', 'cold');--> statement-breakpoint
CREATE TYPE "app"."template_step" AS ENUM('first', 'fu1', 'fu2', 'thank_you');--> statement-breakpoint
CREATE TABLE "app"."activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partnership_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"body" text,
	"actor_email" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"role_title" text,
	"name" text,
	"email" text,
	"phone" text,
	"channel" "app"."contact_channel" DEFAULT 'email' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"bounced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."email_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_type" "app"."partner_type" NOT NULL,
	"step" "app"."template_step" NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."email_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."gmail_connections" (
	"staff_email" text PRIMARY KEY NOT NULL,
	"google_email" text NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"scopes" text NOT NULL,
	"status" "app"."gmail_status" DEFAULT 'active' NOT NULL,
	"daily_cap" integer DEFAULT 30 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."gmail_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."gmail_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partnership_id" uuid NOT NULL,
	"sender_email" text NOT NULL,
	"gmail_thread_id" text NOT NULL,
	"last_rfc_message_id" text,
	"last_sent_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"reply_detected_at" timestamp with time zone,
	"reply_kind" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."gmail_threads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" text NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."imports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."organisations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "app"."partner_type" NOT NULL,
	"name" text NOT NULL,
	"import_key" text NOT NULL,
	"location" text,
	"website" text,
	"fit_reason" text,
	"suggested_approach" text,
	"source_url" text,
	"verification_note" text,
	"needs_verification" boolean DEFAULT false NOT NULL,
	"do_not_contact" boolean DEFAULT false NOT NULL,
	"do_not_contact_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organisations_import_key_unique" UNIQUE("import_key")
);
--> statement-breakpoint
ALTER TABLE "app"."organisations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."partner_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partnership_id" uuid NOT NULL,
	"contact_email" text,
	"token_hash" text NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_access_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "app"."partner_access" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."partner_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partnership_id" uuid NOT NULL,
	"from_name" text,
	"message" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."partner_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."partnerships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"edition_id" uuid NOT NULL,
	"organisation_id" uuid NOT NULL,
	"stage" "app"."partner_stage" DEFAULT 'not_contacted' NOT NULL,
	"temperature" "app"."temperature" DEFAULT 'cold' NOT NULL,
	"owner_email" text,
	"primary_contact_id" uuid,
	"next_action_at" date,
	"personal_line" text,
	"verification_acknowledged_at" timestamp with time zone,
	"past_partner" boolean DEFAULT false NOT NULL,
	"nodal_officer" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"day_plan" text,
	"thank_you_photos_url" text,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."partnerships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."sequence_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partnership_id" uuid NOT NULL,
	"step" "app"."sequence_step_kind" NOT NULL,
	"due_at" date NOT NULL,
	"status" "app"."sequence_step_status" DEFAULT 'pending' NOT NULL,
	"contact_id" uuid,
	"subject" text,
	"body" text,
	"approved_by" text,
	"outbound_message_id" uuid,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."sequence_steps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."short_links" (
	"code" text PRIMARY KEY NOT NULL,
	"target_url" text NOT NULL,
	"label" text,
	"partnership_id" uuid,
	"edition_id" uuid,
	"clicks" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."short_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."task_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"tasks" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."task_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"edition_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" "app"."task_kind" DEFAULT 'other' NOT NULL,
	"owner_email" text,
	"due_at" date,
	"offset_days" integer,
	"status" "app"."task_status" DEFAULT 'open' NOT NULL,
	"partnership_id" uuid,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"source_key" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."activities" ADD CONSTRAINT "activities_partnership_id_partnerships_id_fk" FOREIGN KEY ("partnership_id") REFERENCES "app"."partnerships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contacts" ADD CONSTRAINT "contacts_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "app"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."gmail_threads" ADD CONSTRAINT "gmail_threads_partnership_id_partnerships_id_fk" FOREIGN KEY ("partnership_id") REFERENCES "app"."partnerships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."partner_access" ADD CONSTRAINT "partner_access_partnership_id_partnerships_id_fk" FOREIGN KEY ("partnership_id") REFERENCES "app"."partnerships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."partner_requests" ADD CONSTRAINT "partner_requests_partnership_id_partnerships_id_fk" FOREIGN KEY ("partnership_id") REFERENCES "app"."partnerships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."partnerships" ADD CONSTRAINT "partnerships_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "app"."editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."partnerships" ADD CONSTRAINT "partnerships_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "app"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."partnerships" ADD CONSTRAINT "partnerships_primary_contact_id_contacts_id_fk" FOREIGN KEY ("primary_contact_id") REFERENCES "app"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."sequence_steps" ADD CONSTRAINT "sequence_steps_partnership_id_partnerships_id_fk" FOREIGN KEY ("partnership_id") REFERENCES "app"."partnerships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."sequence_steps" ADD CONSTRAINT "sequence_steps_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "app"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."sequence_steps" ADD CONSTRAINT "sequence_steps_outbound_message_id_outbound_messages_id_fk" FOREIGN KEY ("outbound_message_id") REFERENCES "app"."outbound_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."short_links" ADD CONSTRAINT "short_links_partnership_id_partnerships_id_fk" FOREIGN KEY ("partnership_id") REFERENCES "app"."partnerships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."short_links" ADD CONSTRAINT "short_links_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "app"."editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tasks" ADD CONSTRAINT "tasks_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "app"."editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tasks" ADD CONSTRAINT "tasks_partnership_id_partnerships_id_fk" FOREIGN KEY ("partnership_id") REFERENCES "app"."partnerships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_partnership" ON "app"."activities" USING btree ("partnership_id","at");--> statement-breakpoint
CREATE INDEX "contacts_org" ON "app"."contacts" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "contacts_email" ON "app"."contacts" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "email_templates_type_step" ON "app"."email_templates" USING btree ("partner_type","step");--> statement-breakpoint
CREATE UNIQUE INDEX "gmail_threads_partnership" ON "app"."gmail_threads" USING btree ("partnership_id");--> statement-breakpoint
CREATE INDEX "gmail_threads_open" ON "app"."gmail_threads" USING btree ("reply_detected_at");--> statement-breakpoint
CREATE INDEX "organisations_type" ON "app"."organisations" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "partnerships_edition_org" ON "app"."partnerships" USING btree ("edition_id","organisation_id");--> statement-breakpoint
CREATE INDEX "partnerships_owner" ON "app"."partnerships" USING btree ("owner_email");--> statement-breakpoint
CREATE INDEX "partnerships_stage" ON "app"."partnerships" USING btree ("edition_id","stage");--> statement-breakpoint
CREATE UNIQUE INDEX "sequence_steps_partnership_step" ON "app"."sequence_steps" USING btree ("partnership_id","step");--> statement-breakpoint
CREATE INDEX "sequence_steps_due" ON "app"."sequence_steps" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "tasks_edition_due" ON "app"."tasks" USING btree ("edition_id","status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_source_key" ON "app"."tasks" USING btree ("edition_id","source_key");--> statement-breakpoint
CREATE POLICY "activities_staff_select" ON "app"."activities" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "activities_staff_insert" ON "app"."activities" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "contacts_staff_select" ON "app"."contacts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "contacts_staff_insert" ON "app"."contacts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "contacts_staff_update" ON "app"."contacts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (app_private.is_staff()) WITH CHECK (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "contacts_admin_delete" ON "app"."contacts" AS PERMISSIVE FOR DELETE TO "authenticated" USING (app_private.is_admin());--> statement-breakpoint
CREATE POLICY "email_templates_staff_select" ON "app"."email_templates" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "email_templates_staff_insert" ON "app"."email_templates" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "email_templates_staff_update" ON "app"."email_templates" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (app_private.is_staff()) WITH CHECK (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "email_templates_admin_delete" ON "app"."email_templates" AS PERMISSIVE FOR DELETE TO "authenticated" USING (app_private.is_admin());--> statement-breakpoint
CREATE POLICY "gmail_connections_staff_select" ON "app"."gmail_connections" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "gmail_connections_own_delete" ON "app"."gmail_connections" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("app"."gmail_connections"."staff_email" = app_private.current_email());--> statement-breakpoint
CREATE POLICY "gmail_threads_staff_select" ON "app"."gmail_threads" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "imports_staff_select" ON "app"."imports" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "organisations_staff_select" ON "app"."organisations" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "organisations_staff_insert" ON "app"."organisations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "organisations_staff_update" ON "app"."organisations" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (app_private.is_staff()) WITH CHECK (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "organisations_admin_delete" ON "app"."organisations" AS PERMISSIVE FOR DELETE TO "authenticated" USING (app_private.is_admin());--> statement-breakpoint
CREATE POLICY "partner_access_staff_select" ON "app"."partner_access" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "partner_requests_staff_select" ON "app"."partner_requests" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "partner_requests_staff_insert" ON "app"."partner_requests" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "partner_requests_staff_update" ON "app"."partner_requests" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (app_private.is_staff()) WITH CHECK (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "partner_requests_admin_delete" ON "app"."partner_requests" AS PERMISSIVE FOR DELETE TO "authenticated" USING (app_private.is_admin());--> statement-breakpoint
CREATE POLICY "partnerships_staff_select" ON "app"."partnerships" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "partnerships_staff_insert" ON "app"."partnerships" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "partnerships_staff_update" ON "app"."partnerships" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (app_private.is_staff()) WITH CHECK (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "partnerships_admin_delete" ON "app"."partnerships" AS PERMISSIVE FOR DELETE TO "authenticated" USING (app_private.is_admin());--> statement-breakpoint
CREATE POLICY "sequence_steps_staff_select" ON "app"."sequence_steps" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "sequence_steps_staff_insert" ON "app"."sequence_steps" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "sequence_steps_staff_update" ON "app"."sequence_steps" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (app_private.is_staff()) WITH CHECK (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "sequence_steps_admin_delete" ON "app"."sequence_steps" AS PERMISSIVE FOR DELETE TO "authenticated" USING (app_private.is_admin());--> statement-breakpoint
CREATE POLICY "short_links_staff_select" ON "app"."short_links" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "task_templates_staff_select" ON "app"."task_templates" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "task_templates_staff_insert" ON "app"."task_templates" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "task_templates_staff_update" ON "app"."task_templates" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (app_private.is_staff()) WITH CHECK (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "task_templates_admin_delete" ON "app"."task_templates" AS PERMISSIVE FOR DELETE TO "authenticated" USING (app_private.is_admin());--> statement-breakpoint
CREATE POLICY "tasks_staff_select" ON "app"."tasks" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "tasks_staff_insert" ON "app"."tasks" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "tasks_staff_update" ON "app"."tasks" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (app_private.is_staff()) WITH CHECK (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "tasks_admin_delete" ON "app"."tasks" AS PERMISSIVE FOR DELETE TO "authenticated" USING (app_private.is_admin());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON
  app.organisations, app.contacts, app.partnerships, app.email_templates, app.sequence_steps,
  app.tasks, app.task_templates, app.partner_requests
TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT ON app.activities TO authenticated;
--> statement-breakpoint
GRANT SELECT, DELETE ON app.gmail_connections TO authenticated;
--> statement-breakpoint
-- Staff may see connection status but never the encrypted token.
REVOKE SELECT (refresh_token_enc) ON app.gmail_connections FROM authenticated;
--> statement-breakpoint
GRANT SELECT ON app.gmail_threads, app.partner_access, app.imports, app.short_links TO authenticated;
--> statement-breakpoint
GRANT ALL ON ALL TABLES IN SCHEMA app TO service_role;
