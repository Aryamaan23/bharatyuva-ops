CREATE TYPE "app"."staff_role" AS ENUM('owner', 'admin', 'staff', 'reviewer');--> statement-breakpoint
CREATE TYPE "app"."consent_kind" AS ENUM('processing', 'whatsapp', 'guardian');--> statement-breakpoint
CREATE TYPE "app"."edition_status" AS ENUM('draft', 'outreach', 'applications', 'selection', 'event', 'closed');--> statement-breakpoint
CREATE TYPE "app"."application_status" AS ENUM('draft', 'submitted', 'under_review', 'shortlisted', 'interview', 'selected', 'waitlisted', 'rejected', 'withdrawn', 'confirmed', 'declined', 'attended');--> statement-breakpoint
CREATE TYPE "app"."deletion_status" AS ENUM('pending_verification', 'verified', 'completed', 'rejected');--> statement-breakpoint
CREATE TYPE "app"."job_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "app"."message_channel" AS ENUM('email', 'gmail', 'whatsapp');--> statement-breakpoint
CREATE TYPE "app"."message_status" AS ENUM('pending', 'sending', 'sent', 'redirected', 'logged', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "app"."profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"full_name" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."staff_members" (
	"email" text PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"roles" "app"."staff_role"[] DEFAULT '{}'::app.staff_role[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"phone" text,
	"signature" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."staff_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."consent_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "app"."consent_kind" NOT NULL,
	"version" integer NOT NULL,
	"text_en" text NOT NULL,
	"text_hi" text DEFAULT '' NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."consent_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."editions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"status" "app"."edition_status" DEFAULT 'draft' NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"day1_date" date,
	"day2_date" date,
	"day3_date" date,
	"venues" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"applications_open_at" timestamp with time zone,
	"applications_close_at" timestamp with time zone,
	"seat_confirm_hours" integer DEFAULT 72 NOT NULL,
	"retention_months" integer DEFAULT 12 NOT NULL,
	"min_age" integer DEFAULT 18 NOT NULL,
	"poster_urls" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"post_selection_documents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"contact_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "editions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "app"."editions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."form_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"edition_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."form_definitions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."applicants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"email" text NOT NULL,
	"email_canonical" text NOT NULL,
	"phone_e164" text,
	"full_name" text,
	"date_of_birth" date,
	"state" text,
	"college" text,
	"gender" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applicants_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "applicants_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "app"."applicants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"edition_id" uuid NOT NULL,
	"applicant_id" uuid NOT NULL,
	"form_version" integer NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"status" "app"."application_status" DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp with time zone,
	"locale" text DEFAULT 'en' NOT NULL,
	"attribution" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"referral_code" text,
	"whatsapp_opt_in" boolean DEFAULT false NOT NULL,
	"duplicate_of" uuid,
	"duplicate_reason" text,
	"guardian_required" boolean DEFAULT false NOT NULL,
	"guardian_confirmed_at" timestamp with time zone,
	"seat_offer_expires_at" timestamp with time zone,
	"seat_responded_at" timestamp with time zone,
	"waitlist_rank" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."applications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"applicant_id" uuid NOT NULL,
	"application_id" uuid,
	"consent_version_id" uuid NOT NULL,
	"granted" boolean NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_hash" text,
	"user_agent" text
);
--> statement-breakpoint
ALTER TABLE "app"."consent_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."deletion_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_hash" text NOT NULL,
	"email" text,
	"kind" text DEFAULT 'delete' NOT NULL,
	"reason" text,
	"status" "app"."deletion_status" DEFAULT 'pending_verification' NOT NULL,
	"token_hash" text NOT NULL,
	"verified_at" timestamp with time zone,
	"processed_by" text,
	"processed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deletion_requests_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "app"."deletion_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"storage_path" text NOT NULL,
	"file_name" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."guardian_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"guardian_name" text NOT NULL,
	"guardian_email" text NOT NULL,
	"guardian_relation" text NOT NULL,
	"token_hash" text NOT NULL,
	"sent_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardian_consents_application_id_unique" UNIQUE("application_id"),
	CONSTRAINT "guardian_consents_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "app"."guardian_consents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."app_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_email" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip_hash" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job" text NOT NULL,
	"trigger" text NOT NULL,
	"status" "app"."job_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"items_processed" integer DEFAULT 0 NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "app"."job_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."message_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outbound_message_id" uuid,
	"provider_id" text,
	"kind" text NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."message_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."outbound_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" "app"."message_channel" NOT NULL,
	"idempotency_key" text NOT NULL,
	"to_address" text NOT NULL,
	"subject" text,
	"body_html" text,
	"body_text" text NOT NULL,
	"template" text NOT NULL,
	"sender_email" text,
	"related_entity" text,
	"related_id" uuid,
	"not_before" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "app"."message_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"provider_id" text,
	"sent_at" timestamp with time zone,
	"delivered_to" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbound_messages_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "app"."outbound_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."rate_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."form_definitions" ADD CONSTRAINT "form_definitions_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "app"."editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."applicants" ADD CONSTRAINT "applicants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."applications" ADD CONSTRAINT "applications_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "app"."editions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."applications" ADD CONSTRAINT "applications_applicant_id_applicants_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "app"."applicants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."consent_records" ADD CONSTRAINT "consent_records_applicant_id_applicants_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "app"."applicants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."consent_records" ADD CONSTRAINT "consent_records_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "app"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."consent_records" ADD CONSTRAINT "consent_records_consent_version_id_consent_versions_id_fk" FOREIGN KEY ("consent_version_id") REFERENCES "app"."consent_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."documents" ADD CONSTRAINT "documents_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "app"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."guardian_consents" ADD CONSTRAINT "guardian_consents_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "app"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."message_events" ADD CONSTRAINT "message_events_outbound_message_id_outbound_messages_id_fk" FOREIGN KEY ("outbound_message_id") REFERENCES "app"."outbound_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "consent_versions_kind_version" ON "app"."consent_versions" USING btree ("kind","version");--> statement-breakpoint
CREATE INDEX "consent_versions_kind_published" ON "app"."consent_versions" USING btree ("kind","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "editions_one_current" ON "app"."editions" USING btree ("is_current") WHERE "app"."editions"."is_current";--> statement-breakpoint
CREATE UNIQUE INDEX "form_definitions_edition_version" ON "app"."form_definitions" USING btree ("edition_id","version");--> statement-breakpoint
CREATE INDEX "applicants_email_canonical" ON "app"."applicants" USING btree ("email_canonical");--> statement-breakpoint
CREATE INDEX "applicants_phone" ON "app"."applicants" USING btree ("phone_e164");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_edition_applicant" ON "app"."applications" USING btree ("edition_id","applicant_id");--> statement-breakpoint
CREATE INDEX "applications_edition_status" ON "app"."applications" USING btree ("edition_id","status");--> statement-breakpoint
CREATE INDEX "applications_referral" ON "app"."applications" USING btree ("referral_code");--> statement-breakpoint
CREATE INDEX "consent_records_applicant" ON "app"."consent_records" USING btree ("applicant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_application_kind" ON "app"."documents" USING btree ("application_id","kind");--> statement-breakpoint
CREATE INDEX "audit_log_entity" ON "app"."audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_at" ON "app"."audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "job_runs_job_started" ON "app"."job_runs" USING btree ("job","started_at");--> statement-breakpoint
CREATE INDEX "message_events_message" ON "app"."message_events" USING btree ("outbound_message_id");--> statement-breakpoint
CREATE INDEX "outbound_messages_due" ON "app"."outbound_messages" USING btree ("status","not_before");--> statement-breakpoint
CREATE INDEX "outbound_messages_related" ON "app"."outbound_messages" USING btree ("related_entity","related_id");--> statement-breakpoint
CREATE POLICY "profiles_own" ON "app"."profiles" AS PERMISSIVE FOR ALL TO "authenticated" USING ("app"."profiles"."user_id" = (select auth.uid())) WITH CHECK ("app"."profiles"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "profiles_staff_select" ON "app"."profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "staff_members_select_staff" ON "app"."staff_members" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_staff() or email = app_private.current_email());--> statement-breakpoint
CREATE POLICY "staff_members_write_admin" ON "app"."staff_members" AS PERMISSIVE FOR ALL TO "authenticated" USING (app_private.is_admin()) WITH CHECK (app_private.is_admin());--> statement-breakpoint
CREATE POLICY "consent_versions_select_authenticated" ON "app"."consent_versions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "consent_versions_write_admin" ON "app"."consent_versions" AS PERMISSIVE FOR ALL TO "authenticated" USING (app_private.is_admin()) WITH CHECK (app_private.is_admin());--> statement-breakpoint
CREATE POLICY "editions_select_authenticated" ON "app"."editions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "editions_write_admin" ON "app"."editions" AS PERMISSIVE FOR ALL TO "authenticated" USING (app_private.is_admin()) WITH CHECK (app_private.is_admin());--> statement-breakpoint
CREATE POLICY "form_definitions_select_authenticated" ON "app"."form_definitions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "form_definitions_write_admin" ON "app"."form_definitions" AS PERMISSIVE FOR ALL TO "authenticated" USING (app_private.is_admin()) WITH CHECK (app_private.is_admin());--> statement-breakpoint
CREATE POLICY "applicants_own_select" ON "app"."applicants" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("app"."applicants"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "applicants_own_insert" ON "app"."applicants" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("app"."applicants"."user_id" = (select auth.uid()) and lower("app"."applicants"."email") = app_private.current_email());--> statement-breakpoint
CREATE POLICY "applicants_own_update" ON "app"."applicants" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("app"."applicants"."user_id" = (select auth.uid())) WITH CHECK ("app"."applicants"."user_id" = (select auth.uid()) and lower("app"."applicants"."email") = app_private.current_email());--> statement-breakpoint
CREATE POLICY "applicants_staff_select" ON "app"."applicants" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "applicants_admin_update" ON "app"."applicants" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (app_private.is_admin()) WITH CHECK (app_private.is_admin());--> statement-breakpoint
CREATE POLICY "applications_own_select" ON "app"."applications" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("app"."applications"."applicant_id" = app_private.current_applicant_id());--> statement-breakpoint
CREATE POLICY "applications_own_insert" ON "app"."applications" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("app"."applications"."applicant_id" = app_private.current_applicant_id() and "app"."applications"."status" = 'draft');--> statement-breakpoint
CREATE POLICY "applications_own_update_draft" ON "app"."applications" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("app"."applications"."applicant_id" = app_private.current_applicant_id() and "app"."applications"."status" = 'draft') WITH CHECK ("app"."applications"."applicant_id" = app_private.current_applicant_id() and "app"."applications"."status" in ('draft', 'submitted'));--> statement-breakpoint
CREATE POLICY "applications_staff_select" ON "app"."applications" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "applications_staff_update" ON "app"."applications" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (app_private.is_staff()) WITH CHECK (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "consent_records_own_select" ON "app"."consent_records" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("app"."consent_records"."applicant_id" = app_private.current_applicant_id());--> statement-breakpoint
CREATE POLICY "consent_records_own_insert" ON "app"."consent_records" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("app"."consent_records"."applicant_id" = app_private.current_applicant_id());--> statement-breakpoint
CREATE POLICY "consent_records_staff_select" ON "app"."consent_records" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "deletion_requests_admin" ON "app"."deletion_requests" AS PERMISSIVE FOR ALL TO "authenticated" USING (app_private.is_admin()) WITH CHECK (app_private.is_admin());--> statement-breakpoint
CREATE POLICY "documents_own_select" ON "app"."documents" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from app.applications a where a.id = "app"."documents"."application_id" and a.applicant_id = app_private.current_applicant_id()));--> statement-breakpoint
CREATE POLICY "documents_staff_select" ON "app"."documents" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "guardian_consents_own_select" ON "app"."guardian_consents" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from app.applications a where a.id = "app"."guardian_consents"."application_id" and a.applicant_id = app_private.current_applicant_id()));--> statement-breakpoint
CREATE POLICY "guardian_consents_staff_select" ON "app"."guardian_consents" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "app_settings_staff_select" ON "app"."app_settings" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "app_settings_admin_write" ON "app"."app_settings" AS PERMISSIVE FOR ALL TO "authenticated" USING (app_private.is_admin()) WITH CHECK (app_private.is_admin());--> statement-breakpoint
CREATE POLICY "audit_log_admin_select" ON "app"."audit_log" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_admin());--> statement-breakpoint
CREATE POLICY "audit_log_insert_self" ON "app"."audit_log" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("app"."audit_log"."actor_email" = app_private.current_email());--> statement-breakpoint
CREATE POLICY "job_runs_staff_select" ON "app"."job_runs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "message_events_staff_select" ON "app"."message_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "outbound_messages_staff_select" ON "app"."outbound_messages" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_staff());