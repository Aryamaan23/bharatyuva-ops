CREATE TYPE "app"."ambassador_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "app"."ai_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"model" text NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_summaries_application_id_unique" UNIQUE("application_id")
);
--> statement-breakpoint
ALTER TABLE "app"."ai_summaries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."ambassadors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"edition_id" uuid NOT NULL,
	"user_id" uuid,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"college" text NOT NULL,
	"phone" text,
	"motivation" text,
	"code" text,
	"status" "app"."ambassador_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ambassadors_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "app"."ambassadors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."decision_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"edition_id" uuid NOT NULL,
	"action" text NOT NULL,
	"application_ids" uuid[] NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" text NOT NULL,
	"sent_by" text,
	"sent_at" timestamp with time zone,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."decision_batches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."interview_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slot_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interview_bookings_application_id_unique" UNIQUE("application_id")
);
--> statement-breakpoint
ALTER TABLE "app"."interview_bookings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."interview_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"edition_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"capacity" integer DEFAULT 1 NOT NULL,
	"meeting_link" text,
	"interviewer_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."interview_slots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."review_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"reviewer_email" text NOT NULL,
	"status" text DEFAULT 'assigned' NOT NULL,
	"due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."review_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"scores" jsonb NOT NULL,
	"total" numeric(5, 2) NOT NULL,
	"comment" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_assignment_id_unique" UNIQUE("assignment_id")
);
--> statement-breakpoint
ALTER TABLE "app"."reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."rubrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"edition_id" uuid NOT NULL,
	"criteria" jsonb NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rubrics_edition_id_unique" UNIQUE("edition_id")
);
--> statement-breakpoint
ALTER TABLE "app"."rubrics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."editions" ADD COLUMN "seats" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."ai_summaries" ADD CONSTRAINT "ai_summaries_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "app"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ambassadors" ADD CONSTRAINT "ambassadors_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "app"."editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ambassadors" ADD CONSTRAINT "ambassadors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."decision_batches" ADD CONSTRAINT "decision_batches_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "app"."editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."interview_bookings" ADD CONSTRAINT "interview_bookings_slot_id_interview_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "app"."interview_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."interview_bookings" ADD CONSTRAINT "interview_bookings_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "app"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."interview_slots" ADD CONSTRAINT "interview_slots_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "app"."editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."review_assignments" ADD CONSTRAINT "review_assignments_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "app"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."reviews" ADD CONSTRAINT "reviews_assignment_id_review_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "app"."review_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."rubrics" ADD CONSTRAINT "rubrics_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "app"."editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ambassadors_edition_email" ON "app"."ambassadors" USING btree ("edition_id","email");--> statement-breakpoint
CREATE INDEX "interview_slots_edition" ON "app"."interview_slots" USING btree ("edition_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "review_assignments_app_reviewer" ON "app"."review_assignments" USING btree ("application_id","reviewer_email");--> statement-breakpoint
CREATE INDEX "review_assignments_reviewer" ON "app"."review_assignments" USING btree ("reviewer_email","status");--> statement-breakpoint
CREATE UNIQUE INDEX "message_events_provider_kind" ON "app"."message_events" USING btree ("provider_id","kind");--> statement-breakpoint
CREATE POLICY "ai_summaries_staff_select" ON "app"."ai_summaries" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "ambassadors_own_select" ON "app"."ambassadors" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("app"."ambassadors"."email" = app_private.current_email() or app_private.is_staff());--> statement-breakpoint
CREATE POLICY "ambassadors_staff_update" ON "app"."ambassadors" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (app_private.is_staff()) WITH CHECK (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "decision_batches_staff_select" ON "app"."decision_batches" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "decision_batches_admin_write" ON "app"."decision_batches" AS PERMISSIVE FOR ALL TO "authenticated" USING (app_private.is_admin()) WITH CHECK (app_private.is_admin());--> statement-breakpoint
CREATE POLICY "interview_bookings_staff_select" ON "app"."interview_bookings" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "interview_slots_staff_all" ON "app"."interview_slots" AS PERMISSIVE FOR ALL TO "authenticated" USING (app_private.is_staff()) WITH CHECK (app_private.is_staff());--> statement-breakpoint
CREATE POLICY "review_assignments_own_select" ON "app"."review_assignments" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("app"."review_assignments"."reviewer_email" = app_private.current_email() or app_private.is_staff());--> statement-breakpoint
CREATE POLICY "review_assignments_admin_write" ON "app"."review_assignments" AS PERMISSIVE FOR ALL TO "authenticated" USING (app_private.is_admin()) WITH CHECK (app_private.is_admin());--> statement-breakpoint
CREATE POLICY "reviews_own_or_staff_select" ON "app"."reviews" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_staff() or exists (select 1 from app.review_assignments a where a.id = "app"."reviews"."assignment_id" and a.reviewer_email = app_private.current_email()));--> statement-breakpoint
CREATE POLICY "reviews_own_insert" ON "app"."reviews" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (exists (select 1 from app.review_assignments a where a.id = "app"."reviews"."assignment_id" and a.reviewer_email = app_private.current_email()));--> statement-breakpoint
CREATE POLICY "reviews_own_update" ON "app"."reviews" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (exists (select 1 from app.review_assignments a where a.id = "app"."reviews"."assignment_id" and a.reviewer_email = app_private.current_email())) WITH CHECK (exists (select 1 from app.review_assignments a where a.id = "app"."reviews"."assignment_id" and a.reviewer_email = app_private.current_email()));--> statement-breakpoint
CREATE POLICY "rubrics_staff_or_reviewer_select" ON "app"."rubrics" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_staff() or app_private.has_role('reviewer'));--> statement-breakpoint
CREATE POLICY "rubrics_admin_write" ON "app"."rubrics" AS PERMISSIVE FOR ALL TO "authenticated" USING (app_private.is_admin()) WITH CHECK (app_private.is_admin());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON app.rubrics, app.review_assignments, app.interview_slots, app.decision_batches TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON app.reviews TO authenticated;
--> statement-breakpoint
GRANT SELECT ON app.ai_summaries, app.interview_bookings TO authenticated;
--> statement-breakpoint
GRANT SELECT, UPDATE ON app.ambassadors TO authenticated;
--> statement-breakpoint
GRANT ALL ON ALL TABLES IN SCHEMA app TO service_role;
--> statement-breakpoint
-- Reviewers may read the published form definitions (question text) but never applicant rows.
GRANT EXECUTE ON FUNCTION app_private.has_role(text) TO authenticated;
