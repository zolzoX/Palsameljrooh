/*
# Create signal_deliveries table

1. Purpose
   - The signals table has a single bot_id field, but one signal can be delivered
     to multiple Telegram channels (FREE + VIP). A single field cannot represent
     multiple delivery destinations.
   - This migration creates a dedicated delivery tracking table so each
     signal-to-channel pair has its own status, retry count, and error log.

2. New Table: signal_deliveries
   - id (uuid PK)
   - signal_id (FK to signals, CASCADE on delete)
   - bot_id (FK to telegram_bots, CASCADE on delete)
   - channel_type (text: 'free' or 'vip')
   - channel_id (text: the Telegram chat_id used)
   - status (text: 'pending', 'sent', 'failed', 'skipped')
   - telegram_message_id (text, nullable: message ID returned by Telegram on success)
   - attempts (int, default 0: number of send attempts)
   - last_attempt_at (timestamptz, nullable)
   - delivered_at (timestamptz, nullable)
   - error_message (text, nullable: exact Telegram API error)
   - created_at (timestamptz default now())

3. Indexes
   - Index on signal_id for fast lookups
   - Index on status for finding pending/failed deliveries to retry
   - Unique on (signal_id, bot_id) to prevent duplicate delivery records

4. Security
   - RLS enabled, anon+authenticated full access (single-tenant no-auth app)
*/

CREATE TABLE IF NOT EXISTS signal_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id uuid NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  bot_id uuid NOT NULL REFERENCES telegram_bots(id) ON DELETE CASCADE,
  channel_type text NOT NULL DEFAULT 'vip',
  channel_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  telegram_message_id text,
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  delivered_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signal_deliveries_signal_id ON signal_deliveries(signal_id);
CREATE INDEX IF NOT EXISTS idx_signal_deliveries_status ON signal_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_signal_deliveries_bot_id ON signal_deliveries(bot_id);

-- Prevent duplicate delivery records for the same signal+bot pair
CREATE UNIQUE INDEX IF NOT EXISTS idx_signal_deliveries_unique ON signal_deliveries(signal_id, bot_id);

ALTER TABLE signal_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_signal_deliveries" ON signal_deliveries;
CREATE POLICY "anon_select_signal_deliveries" ON signal_deliveries FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_signal_deliveries" ON signal_deliveries;
CREATE POLICY "anon_insert_signal_deliveries" ON signal_deliveries FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_signal_deliveries" ON signal_deliveries;
CREATE POLICY "anon_update_signal_deliveries" ON signal_deliveries FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_signal_deliveries" ON signal_deliveries;
CREATE POLICY "anon_delete_signal_deliveries" ON signal_deliveries FOR DELETE
  TO anon, authenticated USING (true);
