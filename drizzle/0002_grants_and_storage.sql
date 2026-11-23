-- Privileges for the `authenticated` role (used by withUserDb). RLS policies decide which rows;
-- these grants decide which operations are possible at all. New tables in later migrations must
-- add their own grants (tests/db/rls.test.ts fails if a table has no RLS).

GRANT USAGE ON SCHEMA app TO authenticated, service_role;
--> statement-breakpoint
GRANT ALL ON ALL TABLES IN SCHEMA app TO service_role;
--> statement-breakpoint
GRANT ALL ON ALL SEQUENCES IN SCHEMA app TO service_role;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON
  app.profiles, app.applicants, app.applications
TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON
  app.staff_members, app.editions, app.form_definitions, app.consent_versions, app.app_settings
TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT ON app.consent_records TO authenticated;
--> statement-breakpoint
GRANT SELECT ON
  app.guardian_consents, app.documents, app.outbound_messages, app.message_events, app.job_runs
TO authenticated;
--> statement-breakpoint
GRANT SELECT, UPDATE ON app.deletion_requests TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT ON app.audit_log TO authenticated;
--> statement-breakpoint
GRANT USAGE ON SEQUENCE app.audit_log_id_seq TO authenticated;
--> statement-breakpoint
-- rate_limits: no direct access for authenticated; only via app_private.rate_limit().
REVOKE ALL ON app.rate_limits FROM authenticated, anon;
--> statement-breakpoint

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON app.audit_log
  FOR EACH ROW EXECUTE FUNCTION app_private.reject_mutation();
--> statement-breakpoint
CREATE TRIGGER consent_records_append_only
  BEFORE UPDATE ON app.consent_records
  FOR EACH ROW EXECUTE FUNCTION app_private.reject_mutation();
--> statement-breakpoint

-- Private bucket for applicant documents. No storage policies are defined, so only the service
-- role can read/write; applicants upload through short-lived signed upload URLs issued by our server.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('documents', 'documents', false, 5242880, ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;
