CREATE POLICY "guardian_consents_own_insert" ON "app"."guardian_consents" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (exists (select 1 from app.applications a where a.id = "app"."guardian_consents"."application_id" and a.applicant_id = app_private.current_applicant_id()));--> statement-breakpoint
GRANT INSERT ON app.guardian_consents TO authenticated;
