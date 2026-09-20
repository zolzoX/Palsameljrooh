/*
# Multi-Bot Telegram Manager + Advanced Indicators

## Purpose
Replace the single-bot telegram_config with a flexible multi-bot system.
Add MACD and Bollinger Band indicators alongside RSI/EMA.
Add a signal_config table for per-timeframe indicator settings.
Support 5 timeframes: 5m, 15m, 30m, 1h, 4h.

## New Tables
1. `telegram_bots` — multiple Telegram bots, each with its own token, chat_id, name, and active status
2. `bot_engine_routes` — junction: which monitoring engines each bot is allowed to send signals for
3. `signal_config` — per-timeframe indicator settings (RSI overbought/oversold, EMA periods, MACD params, Bollinger params)

## Modified Tables
1. `signals` — add columns: `indicators` (text array of which indicators triggered), `bot_id` (which bot sent it)
2. `scalping_pairs` — add columns: `macd_line`, `macd_signal`, `macd_histogram`, `bb_upper`, `bb_middle`, `bb_lower`

## Security
- RLS enabled on all new tables, same anon+authenticated pattern (single-tenant, no auth)
- All policies use TO anon, authenticated with USING(true)/WITH CHECK(true)

## Notes
- The old `telegram_config` table is kept for backward compatibility (not dropped)
- The old `engine_channels` table is kept for backward compatibility
- New routing uses `bot_engine_routes` which references `telegram_bots` and uses engine slugs
*/

-- ── telegram_bots ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS telegram_bots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  bot_token text NOT NULL,
  chat_id text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_connected boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── bot_engine_routes (junction: bot → engines) ──────────────
CREATE TABLE IF NOT EXISTS bot_engine_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id uuid NOT NULL REFERENCES telegram_bots(id) ON DELETE CASCADE,
  engine_slug text NOT NULL,
  is_allowed boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (bot_id, engine_slug)
);

-- ── signal_config (per-timeframe indicator settings) ────────
CREATE TABLE IF NOT EXISTS signal_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timeframe text NOT NULL UNIQUE,
  rsi_oversold numeric NOT NULL DEFAULT 30,
  rsi_overbought numeric NOT NULL DEFAULT 70,
  ema_fast_period integer NOT NULL DEFAULT 12,
  ema_slow_period integer NOT NULL DEFAULT 26,
  macd_fast integer NOT NULL DEFAULT 12,
  macd_slow integer NOT NULL DEFAULT 26,
  macd_signal integer NOT NULL DEFAULT 9,
  bb_period integer NOT NULL DEFAULT 20,
  bb_std_dev numeric NOT NULL DEFAULT 2,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ── Add columns to signals ──────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signals' AND column_name = 'indicators') THEN
    ALTER TABLE signals ADD COLUMN indicators text[];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signals' AND column_name = 'bot_id') THEN
    ALTER TABLE signals ADD COLUMN bot_id uuid;
  END IF;
END $$;

-- ── Add indicator columns to scalping_pairs ─────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scalping_pairs' AND column_name = 'macd_line') THEN
    ALTER TABLE scalping_pairs ADD COLUMN macd_line numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scalping_pairs' AND column_name = 'macd_signal') THEN
    ALTER TABLE scalping_pairs ADD COLUMN macd_signal numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scalping_pairs' AND column_name = 'macd_histogram') THEN
    ALTER TABLE scalping_pairs ADD COLUMN macd_histogram numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scalping_pairs' AND column_name = 'bb_upper') THEN
    ALTER TABLE scalping_pairs ADD COLUMN bb_upper numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scalping_pairs' AND column_name = 'bb_middle') THEN
    ALTER TABLE scalping_pairs ADD COLUMN bb_middle numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scalping_pairs' AND column_name = 'bb_lower') THEN
    ALTER TABLE scalping_pairs ADD COLUMN bb_lower numeric DEFAULT 0;
  END IF;
END $$;

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bot_engine_routes_bot ON bot_engine_routes (bot_id);
CREATE INDEX IF NOT EXISTS idx_bot_engine_routes_engine ON bot_engine_routes (engine_slug);
CREATE INDEX IF NOT EXISTS idx_signal_config_tf ON signal_config (timeframe);
CREATE INDEX IF NOT EXISTS idx_signals_bot ON signals (bot_id);

-- ── RLS on new tables ────────────────────────────────────────
ALTER TABLE telegram_bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_engine_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_config ENABLE ROW LEVEL SECURITY;

-- telegram_bots policies
DROP POLICY IF EXISTS "anon_read_telegram_bots" ON telegram_bots;
CREATE POLICY "anon_read_telegram_bots" ON telegram_bots FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_telegram_bots" ON telegram_bots;
CREATE POLICY "anon_insert_telegram_bots" ON telegram_bots FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_telegram_bots" ON telegram_bots;
CREATE POLICY "anon_update_telegram_bots" ON telegram_bots FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_telegram_bots" ON telegram_bots;
CREATE POLICY "anon_delete_telegram_bots" ON telegram_bots FOR DELETE TO anon, authenticated USING (true);

-- bot_engine_routes policies
DROP POLICY IF EXISTS "anon_read_bot_engine_routes" ON bot_engine_routes;
CREATE POLICY "anon_read_bot_engine_routes" ON bot_engine_routes FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_bot_engine_routes" ON bot_engine_routes;
CREATE POLICY "anon_insert_bot_engine_routes" ON bot_engine_routes FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_bot_engine_routes" ON bot_engine_routes;
CREATE POLICY "anon_update_bot_engine_routes" ON bot_engine_routes FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_bot_engine_routes" ON bot_engine_routes;
CREATE POLICY "anon_delete_bot_engine_routes" ON bot_engine_routes FOR DELETE TO anon, authenticated USING (true);

-- signal_config policies
DROP POLICY IF EXISTS "anon_read_signal_config" ON signal_config;
CREATE POLICY "anon_read_signal_config" ON signal_config FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_signal_config" ON signal_config;
CREATE POLICY "anon_insert_signal_config" ON signal_config FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_signal_config" ON signal_config;
CREATE POLICY "anon_update_signal_config" ON signal_config FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_signal_config" ON signal_config;
CREATE POLICY "anon_delete_signal_config" ON signal_config FOR DELETE TO anon, authenticated USING (true);

-- ── Seed signal_config for all 5 timeframes ─────────────────
INSERT INTO signal_config (timeframe, rsi_oversold, rsi_overbought, ema_fast_period, ema_slow_period, macd_fast, macd_slow, macd_signal, bb_period, bb_std_dev, is_active)
VALUES
  ('5m',  30, 70, 12, 26, 12, 26, 9, 20, 2, true),
  ('15m', 30, 70, 12, 26, 12, 26, 9, 20, 2, true),
  ('30m', 30, 70, 12, 26, 12, 26, 9, 20, 2, true),
  ('1h',  30, 70, 12, 26, 12, 26, 9, 20, 2, true),
  ('4h',  30, 70, 12, 26, 12, 26, 9, 20, 2, true)
ON CONFLICT (timeframe) DO NOTHING;

-- ── Migrate existing telegram_config into telegram_bots ─────
INSERT INTO telegram_bots (name, bot_token, chat_id, is_active, is_connected)
SELECT 'Primary Bot', bot_token, chat_id,
  CASE WHEN bot_token IS NOT NULL AND chat_id IS NOT NULL THEN true ELSE false END,
  is_connected
FROM telegram_config
WHERE bot_token IS NOT NULL AND chat_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM telegram_bots LIMIT 1);

-- ── Seed default engine routes for migrated bot ─────────────
INSERT INTO bot_engine_routes (bot_id, engine_slug, is_allowed)
SELECT tb.id, be.slug, true
FROM telegram_bots tb
CROSS JOIN bot_engines be
WHERE NOT EXISTS (
  SELECT 1 FROM bot_engine_routes ber
  WHERE ber.bot_id = tb.id AND ber.engine_slug = be.slug
)
AND tb.is_connected = true;
