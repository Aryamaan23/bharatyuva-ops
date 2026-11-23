-- Helper functions used by RLS policies. They live in app_private, which is not exposed through
-- the Supabase Data API. All are SECURITY DEFINER with an empty search_path so a policy on table A
-- can consult table B without recursive RLS evaluation. Bodies are plpgsql so they may reference
-- tables created by the next migration (plpgsql resolves names at call time).

CREATE SCHEMA IF NOT EXISTS app;
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS app_private;
--> statement-breakpoint
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA app_private TO authenticated, service_role;
--> statement-breakpoint

-- Verified email from the Supabase JWT, lower-cased. NULL when not signed in.
CREATE OR REPLACE FUNCTION app_private.current_email() RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN lower(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email');
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_private.has_role(p_role text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM app.staff_members s
    WHERE s.email = app_private.current_email()
      AND s.active
      AND p_role::app.staff_role = ANY (s.roles)
  );
END;
$$;
--> statement-breakpoint

-- Staff = owner, admin or staff. Reviewers are deliberately excluded: they only ever see
-- anonymised application views, never contact details.
CREATE OR REPLACE FUNCTION app_private.is_staff() RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM app.staff_members s
    WHERE s.email = app_private.current_email()
      AND s.active
      AND s.roles && ARRAY['owner', 'admin', 'staff']::app.staff_role[]
  );
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_private.is_admin() RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM app.staff_members s
    WHERE s.email = app_private.current_email()
      AND s.active
      AND s.roles && ARRAY['owner', 'admin']::app.staff_role[]
  );
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_private.current_applicant_id() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN (SELECT a.id FROM app.applicants a WHERE a.user_id = auth.uid());
END;
$$;
--> statement-breakpoint

-- Fixed-window rate limiter. Returns true when the call is allowed.
CREATE OR REPLACE FUNCTION app_private.rate_limit(p_key text, p_max integer, p_window_seconds integer)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO app.rate_limits AS r (key, window_start, count)
  VALUES (p_key, now(), 1)
  ON CONFLICT (key) DO UPDATE
    SET count = CASE WHEN r.window_start < now() - make_interval(secs => p_window_seconds) THEN 1 ELSE r.count + 1 END,
        window_start = CASE WHEN r.window_start < now() - make_interval(secs => p_window_seconds) THEN now() ELSE r.window_start END
  RETURNING count INTO v_count;
  RETURN v_count <= p_max;
END;
$$;
--> statement-breakpoint

-- Used by the audit_log trigger to make it append-only for every role, including table owners.
CREATE OR REPLACE FUNCTION app_private.reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;
--> statement-breakpoint

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_private FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_private.current_email(), app_private.has_role(text), app_private.is_staff(),
  app_private.is_admin(), app_private.current_applicant_id() TO authenticated, service_role;
