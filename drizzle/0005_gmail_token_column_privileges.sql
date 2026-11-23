-- Column-level REVOKE does not override a table-level GRANT, so grant only the safe columns.
REVOKE SELECT ON app.gmail_connections FROM authenticated;
--> statement-breakpoint
GRANT SELECT (staff_email, google_email, scopes, status, daily_cap, last_error, created_at, updated_at)
  ON app.gmail_connections TO authenticated;
