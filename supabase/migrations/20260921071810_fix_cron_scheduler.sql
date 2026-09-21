/*
# Fix cron scheduler for signal engine

1. Purpose
   - The previous cron function used vault.decrypted_secrets which requires
     pgsodium (not available). This migration creates a simple config table
     for storing the project URL and anon key, and rewrites the cron function
     to use it.

2. Changes
   - Create app_config table for storing key-value configuration.
   - Insert SUPABASE_URL and SUPABASE_ANON_KEY.
   - Drop broken call_signal_engine() and recreate with the new config table.
   - Re-schedule the cron job.

3. Security
   - RLS enabled on app_config. Only anon+authenticated can read (not write secrets).
   - Function is SECURITY DEFINER so cron can read the config and call HTTP.
*/

-- Create a simple config table
CREATE TABLE IF NOT EXISTS app_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_app_config" ON app_config;
CREATE POLICY "anon_read_app_config" ON app_config FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_app_config" ON app_config;
CREATE POLICY "anon_insert_app_config" ON app_config FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_app_config" ON app_config;
CREATE POLICY "anon_update_app_config" ON app_config FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_app_config" ON app_config;
CREATE POLICY "anon_delete_app_config" ON app_config FOR DELETE
  TO anon, authenticated USING (true);

-- Insert the required config values (idempotent)
INSERT INTO app_config (key, value) VALUES
  ('SUPABASE_URL', 'https://edkugowkfojamzivpkbp.supabase.co')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

INSERT INTO app_config (key, value) VALUES
  ('SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVka3Vnb3drZm9qYW16aXZwa2JwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2NzI2NzcsImV4cCI6MjEwNTI0ODY3N30.YYgJNL91Fti5vVbBuYEre0pYQ6M46p2sdboI2Z__xgs')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- Drop the broken function
DROP FUNCTION IF EXISTS public.call_signal_engine();

-- Recreate using app_config instead of vault
CREATE OR REPLACE FUNCTION public.call_signal_engine()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  project_url text;
  anon_key text;
BEGIN
  SELECT value INTO project_url FROM app_config WHERE key = 'SUPABASE_URL' LIMIT 1;
  SELECT value INTO anon_key FROM app_config WHERE key = 'SUPABASE_ANON_KEY' LIMIT 1;

  IF project_url IS NULL OR anon_key IS NULL THEN
    RAISE WARNING 'SUPABASE_URL or SUPABASE_ANON_KEY not found in app_config, skipping signal engine call';
    RETURN;
  END IF;

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

GRANT EXECUTE ON FUNCTION public.call_signal_engine TO authenticated;
GRANT EXECUTE ON FUNCTION public.call_signal_engine TO anon;

-- Re-schedule the cron job
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
