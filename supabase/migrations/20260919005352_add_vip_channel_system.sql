/*
# Add VIP Channel System, Subscription Plans, Payment Proof & Invite Links

1. New Columns on `telegram_bots`
- `channel_type` (text, default 'vip') — 'free' for public channel (locked preview), 'vip' for full signals.
  This lets the signal engine know which format to use per bot.

2. New Table: `vip_settings`
- Single-row configuration table for the VIP subscription system.
- `vip_bot_token` (text) — Telegram bot token for the VIP subscription bot.
- `vip_channel_id` (text) — Chat ID of the private VIP channel.
- `vip_subscribe_url` (text) — Direct link to the VIP subscription bot (t.me/...).
- `admin_username` (text, default '@tolerank') — Telegram username where users send payment proof.
- `wallet_trc20` (text) — USDT TRC20 wallet address.
- `wallet_bep20` (text) — USDT BEP20 wallet address.
- `wallet_erc20` (text) — USDT ERC20 wallet address.
- `updated_at` (timestamptz).

3. New Table: `vip_plans`
- Subscription plans shown to users in the VIP bot.
- `id` (uuid PK), `name` (text), `duration` (text: '1_week' / '3_months' / 'lifetime'), `price_usdt` (numeric), `description` (text), `sort_order` (int), `is_active` (bool).

4. New Table: `vip_subscriptions`
- Tracks user subscription attempts and payments.
- `id` (uuid PK), `telegram_user_id` (text), `telegram_username` (text), `plan_id` (uuid FK), `status` (text: 'pending' / 'paid' / 'rejected' / 'expired'), `txid` (text nullable), `screenshot_url` (text nullable), `invite_link` (text nullable), `admin_notes` (text nullable), `created_at`, `verified_at` (timestamptz nullable), `expires_at` (timestamptz nullable).

5. Security
- RLS enabled on all new tables.
- All tables use `TO anon, authenticated` with `USING (true)` / `WITH CHECK (true)` — this is a single-tenant admin panel with no sign-in screen, so all data is intentionally public/shared.
*/

-- 1. Add channel_type to telegram_bots
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'telegram_bots' AND column_name = 'channel_type') THEN
    ALTER TABLE telegram_bots ADD COLUMN channel_type text NOT NULL DEFAULT 'vip';
  END IF;
END $$;

-- 2. Create vip_settings table
CREATE TABLE IF NOT EXISTS vip_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vip_bot_token text,
  vip_channel_id text,
  vip_subscribe_url text,
  admin_username text NOT NULL DEFAULT '@tolerank',
  wallet_trc20 text,
  wallet_bep20 text,
  wallet_erc20 text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE vip_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_vip_settings" ON vip_settings;
CREATE POLICY "anon_select_vip_settings" ON vip_settings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_vip_settings" ON vip_settings;
CREATE POLICY "anon_insert_vip_settings" ON vip_settings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_vip_settings" ON vip_settings;
CREATE POLICY "anon_update_vip_settings" ON vip_settings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_vip_settings" ON vip_settings;
CREATE POLICY "anon_delete_vip_settings" ON vip_settings FOR DELETE
  TO anon, authenticated USING (true);

-- Seed default row if empty
INSERT INTO vip_settings (admin_username)
SELECT '@tolerank'
WHERE NOT EXISTS (SELECT 1 FROM vip_settings);

-- 3. Create vip_plans table
CREATE TABLE IF NOT EXISTS vip_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  duration text NOT NULL,
  price_usdt numeric(10,2) NOT NULL DEFAULT 0,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE vip_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_vip_plans" ON vip_plans;
CREATE POLICY "anon_select_vip_plans" ON vip_plans FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_vip_plans" ON vip_plans;
CREATE POLICY "anon_insert_vip_plans" ON vip_plans FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_vip_plans" ON vip_plans;
CREATE POLICY "anon_update_vip_plans" ON vip_plans FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_vip_plans" ON vip_plans;
CREATE POLICY "anon_delete_vip_plans" ON vip_plans FOR DELETE
  TO anon, authenticated USING (true);

-- Seed default plans
INSERT INTO vip_plans (name, duration, price_usdt, description, sort_order)
SELECT '1 Week', '1_week', 25.00, '7 days full VIP access', 1
WHERE NOT EXISTS (SELECT 1 FROM vip_plans WHERE duration = '1_week');

INSERT INTO vip_plans (name, duration, price_usdt, description, sort_order)
SELECT '3 Months', '3_months', 99.00, '90 days full VIP access', 2
WHERE NOT EXISTS (SELECT 1 FROM vip_plans WHERE duration = '3_months');

INSERT INTO vip_plans (name, duration, price_usdt, description, sort_order)
SELECT 'Lifetime', 'lifetime', 299.00, 'Permanent VIP access', 3
WHERE NOT EXISTS (SELECT 1 FROM vip_plans WHERE duration = 'lifetime');

-- 4. Create vip_subscriptions table
CREATE TABLE IF NOT EXISTS vip_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id text NOT NULL,
  telegram_username text,
  plan_id uuid REFERENCES vip_plans(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  txid text,
  screenshot_url text,
  invite_link text,
  admin_notes text,
  created_at timestamptz DEFAULT now(),
  verified_at timestamptz,
  expires_at timestamptz
);

ALTER TABLE vip_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_vip_subs" ON vip_subscriptions;
CREATE POLICY "anon_select_vip_subs" ON vip_subscriptions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_vip_subs" ON vip_subscriptions;
CREATE POLICY "anon_insert_vip_subs" ON vip_subscriptions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_vip_subs" ON vip_subscriptions;
CREATE POLICY "anon_update_vip_subs" ON vip_subscriptions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_vip_subs" ON vip_subscriptions;
CREATE POLICY "anon_delete_vip_subs" ON vip_subscriptions FOR DELETE
  TO anon, authenticated USING (true);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_vip_subs_user_id ON vip_subscriptions(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_vip_subs_status ON vip_subscriptions(status);
