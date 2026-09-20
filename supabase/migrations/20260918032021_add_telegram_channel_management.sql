/*
# Telegram Channel Management System

1. New Tables
- `telegram_channels` — stores source channels to scrape members from
  - id, channel_username, channel_id, title, member_count, status, created_at
- `channel_members` — stores fetched members from channels
  - id, channel_id (fk), user_id (telegram numeric id), username, first_name, last_name, is_bot, scraped_at
- `invite_jobs` — stores invite/transfer batch jobs
  - id, source_channel_id (fk), target_channel_username, target_bot_id, total_users, processed, succeeded, failed, rate_limited, status, created_at, completed_at
- `invite_job_items` — individual member processing log
  - id, job_id (fk), member_user_id, member_username, status (pending/success/failed/rate_limited), error_message, processed_at

2. Security
- RLS enabled on all tables, anon+authenticated CRUD (single-tenant admin panel).
*/

CREATE TABLE IF NOT EXISTS telegram_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_username text NOT NULL,
  channel_id text,
  title text,
  member_count integer DEFAULT 0,
  status text DEFAULT 'idle',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE telegram_channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_telegram_channels" ON telegram_channels;
CREATE POLICY "anon_crud_telegram_channels" ON telegram_channels FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_telegram_channels" ON telegram_channels;
CREATE POLICY "anon_insert_telegram_channels" ON telegram_channels FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_telegram_channels" ON telegram_channels;
CREATE POLICY "anon_update_telegram_channels" ON telegram_channels FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_telegram_channels" ON telegram_channels;
CREATE POLICY "anon_delete_telegram_channels" ON telegram_channels FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS channel_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES telegram_channels(id) ON DELETE CASCADE,
  user_id text,
  username text,
  first_name text,
  last_name text,
  is_bot boolean DEFAULT false,
  scraped_at timestamptz DEFAULT now(),
  UNIQUE(channel_id, user_id)
);
ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_channel_members" ON channel_members;
CREATE POLICY "anon_select_channel_members" ON channel_members FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_channel_members" ON channel_members;
CREATE POLICY "anon_insert_channel_members" ON channel_members FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_channel_members" ON channel_members;
CREATE POLICY "anon_delete_channel_members" ON channel_members FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS invite_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_channel_id uuid REFERENCES telegram_channels(id) ON DELETE CASCADE,
  target_channel_username text,
  target_bot_id text,
  total_users integer DEFAULT 0,
  processed integer DEFAULT 0,
  succeeded integer DEFAULT 0,
  failed integer DEFAULT 0,
  rate_limited integer DEFAULT 0,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE invite_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_invite_jobs" ON invite_jobs;
CREATE POLICY "anon_select_invite_jobs" ON invite_jobs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_invite_jobs" ON invite_jobs;
CREATE POLICY "anon_insert_invite_jobs" ON invite_jobs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_invite_jobs" ON invite_jobs;
CREATE POLICY "anon_update_invite_jobs" ON invite_jobs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_invite_jobs" ON invite_jobs;
CREATE POLICY "anon_delete_invite_jobs" ON invite_jobs FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS invite_job_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES invite_jobs(id) ON DELETE CASCADE,
  member_user_id text,
  member_username text,
  status text DEFAULT 'pending',
  error_message text,
  processed_at timestamptz
);
ALTER TABLE invite_job_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_invite_job_items" ON invite_job_items;
CREATE POLICY "anon_select_invite_job_items" ON invite_job_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_invite_job_items" ON invite_job_items;
CREATE POLICY "anon_insert_invite_job_items" ON invite_job_items FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_invite_job_items" ON invite_job_items;
CREATE POLICY "anon_update_invite_job_items" ON invite_job_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_invite_job_items" ON invite_job_items;
CREATE POLICY "anon_delete_invite_job_items" ON invite_job_items FOR DELETE TO anon, authenticated USING (true);
