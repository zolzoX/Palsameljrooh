/*
# Add pg_cron schedule for signal engine

1. Purpose
   - The signal engine (edge function `signal-engine`) was only running when the admin
     had the browser tab open (client-side setInterval). This meant no signals,
     news, whale alerts, or meme alerts were generated when the dashboard was closed.
   - This migration enables pg_cron and creates a job that calls the signal-engine
     edge function every 2 minutes, 24/7, server-side — no browser needed.

2. Changes
   - Enable the pg_cron extension.
   - Enable pg_net for HTTP calls from cron.
   - Create a SECURITY DEFINER helper function that POSTs to the signal-engine edge function.
   - Schedule a cron job `run-signal-engine` every 2 minutes.

3. Notes
   - The signal engine has built-in deduplication (15-min window) and daily limits,
     so running every 2 minutes is safe — it will skip if there's nothing new.
*/

-- Enable pg_cron if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Enable pg_net for HTTP calls from cron
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create a helper function to call the signal engine edge function
CREATE OR REPLACE FUNCTION public.call_signal_engine()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  project_url text;
  anon_key text;
BEGIN
  -- Get the project URL from the default vault
  SELECT decrypted_value INTO project_url
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_URL'
  LIMIT 1;

  SELECT decrypted_value INTO anon_key
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_ANON_KEY'
  LIMIT 1;

  IF project_url IS NULL OR anon_key IS NULL THEN
    RAISE NOTICE 'SUPABASE_URL or SUPABASE_ANON_KEY not found in vault, skipping signal engine call';
    RETURN;
  END IF;

  -- Call the signal-engine edge function
  PERFORM net.http_post(
    url := project_url || '/functions/v1/signal-engine',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || anon_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('timeframe', '1h')
  );
END;
$$;

-- Schedule the job every 2 minutes (unschedule first if it exists)
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'run-signal-engine';
EXCEPTION WHEN OTHERS THEN
  NULL;
END$$;

SELECT cron.schedule(
  'run-signal-engine',
  '*/2 * * * *',
  $$SELECT public.call_signal_engine();$$
);
