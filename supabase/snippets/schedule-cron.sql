-- Sub-daily scheduling for Vercel Hobby (whose crons run at most daily).
-- Run ONCE per Supabase project in the SQL editor, after replacing the two placeholders.
-- Requires the pg_cron and pg_net extensions (Database → Extensions in the dashboard).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Store the app URL and cron secret in Vault so they never appear in cron.job.
select vault.create_secret('https://<YOUR-APP-DOMAIN>', 'by_app_url');
select vault.create_secret('<YOUR CRON_SECRET>', 'by_cron_secret');

create or replace function public.by_call_job(job text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  base text := (select decrypted_secret from vault.decrypted_secrets where name = 'by_app_url');
  secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'by_cron_secret');
begin
  perform net.http_get(
    url := base || '/api/cron/' || job || '?trigger=pg_cron',
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 55000
  );
end;
$$;
revoke all on function public.by_call_job(text) from public, anon, authenticated;

-- Times are UTC. IST = UTC + 5:30.
-- Send queued email every 5 minutes, 09:00–19:00 IST (03:30–13:30 UTC).
select cron.schedule('by-drain-outbox', '*/5 3-13 * * *', $$select public.by_call_job('drain-outbox')$$);
-- Check Gmail threads for replies hourly, 07:00–23:00 IST.
select cron.schedule('by-replies', '15 1-17 * * *', $$select public.by_call_job('replies')$$);

-- To inspect:   select * from cron.job;   select * from cron.job_run_details order by start_time desc limit 20;
-- To remove:    select cron.unschedule('by-drain-outbox'); select cron.unschedule('by-replies');
