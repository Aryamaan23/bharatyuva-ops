CREATE TYPE "app"."certificate_kind" AS ENUM('participation', 'winner', 'ambassador');--> statement-breakpoint
CREATE TABLE "app"."certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"edition_id" uuid NOT NULL,
	"application_id" uuid,
	"ambassador_id" uuid,
	"kind" "app"."certificate_kind" NOT NULL,
	"code" text NOT NULL,
	"recipient_name" text NOT NULL,
	"college" text,
	"detail" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "certificates_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "app"."certificates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"day" integer NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"by_email" text NOT NULL,
	"client_id" text
);
--> statement-breakpoint
ALTER TABLE "app"."checkins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."emergency_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"name" text NOT NULL,
	"relation" text NOT NULL,
	"phone" text NOT NULL,
	"medical_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "emergency_contacts_application_id_unique" UNIQUE("application_id")
);
--> statement-breakpoint
ALTER TABLE "app"."emergency_contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."feedback_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"day" integer NOT NULL,
	"rating" integer NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."feedback_responses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."run_of_show" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"edition_id" uuid NOT NULL,
	"day" integer NOT NULL,
	"starts_at" text NOT NULL,
	"ends_at" text,
	"title" text NOT NULL,
	"location" text,
	"owner_email" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."run_of_show" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"title" text NOT NULL,
	"abstract" text,
	"file_path" text NOT NULL,
	"file_name" text NOT NULL,
	"submitted_by" uuid,
	"status" text DEFAULT 'received' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_application_id_unique" UNIQUE("application_id")
);
--> statement-breakpoint
ALTER TABLE "app"."team_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"edition_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"name" text NOT NULL,
	"mentor" text,
	"is_winner" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."teams" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."certificates" ADD CONSTRAINT "certificates_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "app"."editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."certificates" ADD CONSTRAINT "certificates_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "app"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."certificates" ADD CONSTRAINT "certificates_ambassador_id_ambassadors_id_fk" FOREIGN KEY ("ambassador_id") REFERENCES "app"."ambassadors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."checkins" ADD CONSTRAINT "checkins_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "app"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."emergency_contacts" ADD CONSTRAINT "emergency_contacts_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "app"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."feedback_responses" ADD CONSTRAINT "feedback_responses_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "app"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."run_of_show" ADD CONSTRAINT "run_of_show_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "app"."editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."submissions" ADD CONSTRAINT "submissions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "app"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."submissions" ADD CONSTRAINT "submissions_submitted_by_applications_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "app"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "app"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."team_members" ADD CONSTRAINT "team_members_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "app"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."teams" ADD CONSTRAINT "teams_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "app"."editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "certificates_app_kind" ON "app"."certificates" USING btree ("application_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "certificates_ambassador_kind" ON "app"."certificates" USING btree ("ambassador_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "checkins_app_day" ON "app"."checkins" USING btree ("application_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_app_day" ON "app"."feedback_responses" USING btree ("application_id","day");--> statement-breakpoint
CREATE INDEX "run_of_show_edition_day" ON "app"."run_of_show" USING btree ("edition_id","day","starts_at");--> statement-breakpoint
CREATE INDEX "submissions_team" ON "app"."submissions" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_edition_number" ON "app"."teams" USING btree ("edition_id","number");--> statement-breakpoint
CREATE POLICY "certificates_staff_select" ON "app"."certificates" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "checkins_staff_all" ON "app"."checkins" AS PERMISSIVE FOR ALL TO "authenticated" USING (app_private.is_staff()) WITH CHECK (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "emergency_contacts_staff_select" ON "app"."emergency_contacts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "feedback_staff_select" ON "app"."feedback_responses" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "run_of_show_staff_all" ON "app"."run_of_show" AS PERMISSIVE FOR ALL TO "authenticated" USING (app_private.is_staff()) WITH CHECK (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "submissions_staff_all" ON "app"."submissions" AS PERMISSIVE FOR ALL TO "authenticated" USING (app_private.is_staff()) WITH CHECK (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "team_members_staff_all" ON "app"."team_members" AS PERMISSIVE FOR ALL TO "authenticated" USING (app_private.is_staff()) WITH CHECK (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "teams_staff_all" ON "app"."teams" AS PERMISSIVE FOR ALL TO "authenticated" USING (app_private.is_staff()) WITH CHECK (app_private.is_staff());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON app.teams, app.team_members, app.run_of_show, app.checkins, app.submissions TO authenticated;
--> statement-breakpoint
GRANT SELECT ON app.emergency_contacts, app.feedback_responses, app.certificates TO authenticated;
--> statement-breakpoint
GRANT ALL ON ALL TABLES IN SCHEMA app TO service_role;
