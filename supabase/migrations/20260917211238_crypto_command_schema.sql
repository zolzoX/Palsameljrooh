/*
# Crypto Command — Full Schema

1. Purpose
   A single-tenant (no auth) crypto monitoring dashboard. The anon-key frontend
   reads and writes config, signals, logs, and alerts. All data is intentionally
   shared/public within the app.

2. New Tables
   - bot_engines          — the four monitoring engines (scalping, meme, whale, news) and their active/health status
   - telegram_config     — single-row table storing the Telegram Bot Token + Chat ID
   - channels            — Telegram channels users can route alerts to
   - engine_channels     — junction table: which engines are allowed to send to which channels
   - signals             — history of past alerts with delivery status and source links
   - system_logs         — real-time-ish log entries shown in the admin dashboard log stream
   - whale_alerts        — large crypto movement alerts with estimated USD values
   - news_items          — aggregated crypto news with sentiment analysis results
   - scalping_pairs      — crypto pairs (BTC, ETH, SOL) with simulated RSI / EMA indicators
   - meme_tokens         — trending meme tokens fetched from DexScreener (cached)

3. Security
   - RLS enabled on every table.
   - All policies use TO anon, authenticated with USING (true) / WITH CHECK (true)
     because this is a single-tenant, no-auth app where all data is intentionally shared.
*/

-- ── bot_engines ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bot_engines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  health text NOT NULL DEFAULT 'healthy',
  signals_today integer NOT NULL DEFAULT 0,
  last_signal_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ── telegram_config (single row) ─────────────────────────────
CREATE TABLE IF NOT EXISTS telegram_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_token text,
  chat_id text,
  is_connected boolean NOT NULL DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

-- ── channels ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  chat_id text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ── engine_channels (junction) ───────────────────────────────
CREATE TABLE IF NOT EXISTS engine_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_slug text NOT NULL REFERENCES bot_engines(slug) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  is_allowed boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (engine_slug, channel_id)
);

-- ── signals ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_slug text NOT NULL,
  title text NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'pending',
  source_url text,
  pair text,
  sentiment text,
  created_at timestamptz DEFAULT now()
);

-- ── system_logs ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL DEFAULT 'info',
  engine_slug text,
  message text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ── whale_alerts ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whale_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset text NOT NULL,
  amount numeric NOT NULL,
  usd_value numeric NOT NULL,
  direction text NOT NULL DEFAULT 'in',
  from_addr text,
  to_addr text,
  created_at timestamptz DEFAULT now()
);

-- ── news_items ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS news_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  source text,
  url text,
  sentiment text NOT NULL DEFAULT 'neutral',
  keywords text[],
  published_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- ── scalping_pairs ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scalping_pairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL UNIQUE,
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  price_change_24h numeric NOT NULL DEFAULT 0,
  rsi numeric NOT NULL DEFAULT 50,
  ema_fast numeric NOT NULL DEFAULT 0,
  ema_slow numeric NOT NULL DEFAULT 0,
  trend text NOT NULL DEFAULT 'neutral',
  volume numeric NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- ── meme_tokens ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meme_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  price_change_24h numeric NOT NULL DEFAULT 0,
  liquidity numeric NOT NULL DEFAULT 0,
  volume_24h numeric NOT NULL DEFAULT 0,
  chain text NOT NULL DEFAULT 'ethereum',
  dex_url text,
  fetched_at timestamptz DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_signals_created_at ON signals (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_engine ON signals (engine_slug);
CREATE INDEX IF NOT EXISTS idx_signals_status ON signals (status);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON system_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whale_created_at ON whale_alerts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_published ON news_items (published_at DESC);

-- ── RLS: enable on all tables ─────────────────────────────────
ALTER TABLE bot_engines ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE engine_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE whale_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE scalping_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE meme_tokens ENABLE ROW LEVEL SECURITY;

-- ── RLS policies (anon + authenticated, single-tenant) ────────
-- bot_engines
DROP POLICY IF EXISTS "anon_read_bot_engines" ON bot_engines;
CREATE POLICY "anon_read_bot_engines" ON bot_engines FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_write_bot_engines" ON bot_engines;
CREATE POLICY "anon_write_bot_engines" ON bot_engines FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_bot_engines" ON bot_engines;
CREATE POLICY "anon_update_bot_engines" ON bot_engines FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_bot_engines" ON bot_engines;
CREATE POLICY "anon_delete_bot_engines" ON bot_engines FOR DELETE TO anon, authenticated USING (true);

-- telegram_config
DROP POLICY IF EXISTS "anon_read_telegram_config" ON telegram_config;
CREATE POLICY "anon_read_telegram_config" ON telegram_config FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_telegram_config" ON telegram_config;
CREATE POLICY "anon_insert_telegram_config" ON telegram_config FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_telegram_config" ON telegram_config;
CREATE POLICY "anon_update_telegram_config" ON telegram_config FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_telegram_config" ON telegram_config;
CREATE POLICY "anon_delete_telegram_config" ON telegram_config FOR DELETE TO anon, authenticated USING (true);

-- channels
DROP POLICY IF EXISTS "anon_read_channels" ON channels;
CREATE POLICY "anon_read_channels" ON channels FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_channels" ON channels;
CREATE POLICY "anon_insert_channels" ON channels FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_channels" ON channels;
CREATE POLICY "anon_update_channels" ON channels FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_channels" ON channels;
CREATE POLICY "anon_delete_channels" ON channels FOR DELETE TO anon, authenticated USING (true);

-- engine_channels
DROP POLICY IF EXISTS "anon_read_engine_channels" ON engine_channels;
CREATE POLICY "anon_read_engine_channels" ON engine_channels FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_engine_channels" ON engine_channels;
CREATE POLICY "anon_insert_engine_channels" ON engine_channels FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_engine_channels" ON engine_channels;
CREATE POLICY "anon_update_engine_channels" ON engine_channels FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_engine_channels" ON engine_channels;
CREATE POLICY "anon_delete_engine_channels" ON engine_channels FOR DELETE TO anon, authenticated USING (true);

-- signals
DROP POLICY IF EXISTS "anon_read_signals" ON signals;
CREATE POLICY "anon_read_signals" ON signals FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_signals" ON signals;
CREATE POLICY "anon_insert_signals" ON signals FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_signals" ON signals;
CREATE POLICY "anon_update_signals" ON signals FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_signals" ON signals;
CREATE POLICY "anon_delete_signals" ON signals FOR DELETE TO anon, authenticated USING (true);

-- system_logs
DROP POLICY IF EXISTS "anon_read_system_logs" ON system_logs;
CREATE POLICY "anon_read_system_logs" ON system_logs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_system_logs" ON system_logs;
CREATE POLICY "anon_insert_system_logs" ON system_logs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_system_logs" ON system_logs;
CREATE POLICY "anon_update_system_logs" ON system_logs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_system_logs" ON system_logs;
CREATE POLICY "anon_delete_system_logs" ON system_logs FOR DELETE TO anon, authenticated USING (true);

-- whale_alerts
DROP POLICY IF EXISTS "anon_read_whale_alerts" ON whale_alerts;
CREATE POLICY "anon_read_whale_alerts" ON whale_alerts FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_whale_alerts" ON whale_alerts;
CREATE POLICY "anon_insert_whale_alerts" ON whale_alerts FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_whale_alerts" ON whale_alerts;
CREATE POLICY "anon_update_whale_alerts" ON whale_alerts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_whale_alerts" ON whale_alerts;
CREATE POLICY "anon_delete_whale_alerts" ON whale_alerts FOR DELETE TO anon, authenticated USING (true);

-- news_items
DROP POLICY IF EXISTS "anon_read_news_items" ON news_items;
CREATE POLICY "anon_read_news_items" ON news_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_news_items" ON news_items;
CREATE POLICY "anon_insert_news_items" ON news_items FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_news_items" ON news_items;
CREATE POLICY "anon_update_news_items" ON news_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_news_items" ON news_items;
CREATE POLICY "anon_delete_news_items" ON news_items FOR DELETE TO anon, authenticated USING (true);

-- scalping_pairs
DROP POLICY IF EXISTS "anon_read_scalping_pairs" ON scalping_pairs;
CREATE POLICY "anon_read_scalping_pairs" ON scalping_pairs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_scalping_pairs" ON scalping_pairs;
CREATE POLICY "anon_insert_scalping_pairs" ON scalping_pairs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_scalping_pairs" ON scalping_pairs;
CREATE POLICY "anon_update_scalping_pairs" ON scalping_pairs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_scalping_pairs" ON scalping_pairs;
CREATE POLICY "anon_delete_scalping_pairs" ON scalping_pairs FOR DELETE TO anon, authenticated USING (true);

-- meme_tokens
DROP POLICY IF EXISTS "anon_read_meme_tokens" ON meme_tokens;
CREATE POLICY "anon_read_meme_tokens" ON meme_tokens FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_meme_tokens" ON meme_tokens;
CREATE POLICY "anon_insert_meme_tokens" ON meme_tokens FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_meme_tokens" ON meme_tokens;
CREATE POLICY "anon_update_meme_tokens" ON meme_tokens FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_meme_tokens" ON meme_tokens;
CREATE POLICY "anon_delete_meme_tokens" ON meme_tokens FOR DELETE TO anon, authenticated USING (true);

-- ── Seed data ────────────────────────────────────────────────
INSERT INTO bot_engines (slug, name, description, is_active, health, signals_today)
VALUES
  ('scalping', 'Scalping Engine', 'Monitors BTC, ETH, SOL with RSI and EMA trend indicators', true, 'healthy', 0),
  ('meme', 'Meme Radar', 'Fetches trending tokens from DexScreener with liquidity filters', true, 'healthy', 0),
  ('whale', 'Whale Tracker', 'Tracks large crypto movements with estimated USD values', true, 'healthy', 0),
  ('news', 'AI News Desk', 'Aggregates crypto RSS feeds with keyword/sentiment analysis', true, 'healthy', 0)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO telegram_config (id, bot_token, chat_id, is_connected)
SELECT gen_random_uuid(), null, null, false
WHERE NOT EXISTS (SELECT 1 FROM telegram_config);

INSERT INTO scalping_pairs (symbol, name, price, price_change_24h, rsi, ema_fast, ema_slow, trend, volume)
VALUES
  ('BTC', 'Bitcoin', 67250.50, 2.3, 58.2, 66800, 65200, 'bullish', 28.5e9),
  ('ETH', 'Ethereum', 3245.80, 1.8, 55.5, 3220, 3150, 'bullish', 12.3e9),
  ('SOL', 'Solana', 168.42, -0.7, 44.1, 170, 172, 'bearish', 3.2e9)
ON CONFLICT (symbol) DO NOTHING;

INSERT INTO channels (name, chat_id, description, is_active)
VALUES
  ('Main Signals', '-1001234567890', 'Primary alert channel', true),
  ('Whale Alerts', '-1001234567891', 'Whale movement alerts only', true),
  ('News Feed', '-1001234567892', 'AI News Desk sentiment alerts', true)
ON CONFLICT DO NOTHING;

INSERT INTO engine_channels (engine_slug, channel_id, is_allowed)
SELECT 'scalping', c.id, true FROM channels c WHERE c.name = 'Main Signals'
  AND NOT EXISTS (SELECT 1 FROM engine_channels ec WHERE ec.engine_slug = 'scalping' AND ec.channel_id = c.id);

INSERT INTO engine_channels (engine_slug, channel_id, is_allowed)
SELECT 'meme', c.id, true FROM channels c WHERE c.name = 'Main Signals'
  AND NOT EXISTS (SELECT 1 FROM engine_channels ec WHERE ec.engine_slug = 'meme' AND ec.channel_id = c.id);

INSERT INTO engine_channels (engine_slug, channel_id, is_allowed)
SELECT 'whale', c.id, true FROM channels c WHERE c.name = 'Whale Alerts'
  AND NOT EXISTS (SELECT 1 FROM engine_channels ec WHERE ec.engine_slug = 'whale' AND ec.channel_id = c.id);

INSERT INTO engine_channels (engine_slug, channel_id, is_allowed)
SELECT 'news', c.id, true FROM channels c WHERE c.name = 'News Feed'
  AND NOT EXISTS (SELECT 1 FROM engine_channels ec WHERE ec.engine_slug = 'news' AND ec.channel_id = c.id);

INSERT INTO system_logs (level, engine_slug, message)
VALUES
  ('info', 'scalping', 'Scalping Engine initialized — monitoring BTC, ETH, SOL'),
  ('info', 'meme', 'Meme Radar connected to DexScreener API'),
  ('info', 'whale', 'Whale Tracker listening for large on-chain movements'),
  ('info', 'news', 'AI News Desk subscribed to crypto RSS feeds'),
  ('success', null, 'All engines online. System ready.')
ON CONFLICT DO NOTHING;

INSERT INTO whale_alerts (asset, amount, usd_value, direction, from_addr, to_addr)
VALUES
  ('BTC', 1250, 84000000, 'out', '0x7a2f...e91b', '0x3c8d...f42a'),
  ('ETH', 45000, 145960000, 'in', '0xb1e5...a73c', '0x9f02...c8d1'),
  ('USDT', 5000000, 5000000, 'out', '0x4d1c...88f0', '0x2a7b...e45f'),
  ('SOL', 80000, 13440000, 'in', '0xc6f0...d2e8', '0x1b3a...907c')
ON CONFLICT DO NOTHING;

INSERT INTO news_items (title, source, url, sentiment, keywords, published_at)
VALUES
  ('Bitcoin breaks above key resistance as ETF inflows surge', 'CoinDesk', 'https://coindesk.com', 'bullish', ARRAY['bitcoin','etf','resistance'], now() - interval '2 hours'),
  ('Ethereum gas fees hit yearly low amid L2 adoption', 'The Block', 'https://theblock.co', 'bullish', ARRAY['ethereum','gas','l2'], now() - interval '4 hours'),
  ('SEC announces new review of stablecoin reserves', 'CoinTelegraph', 'https://cointelegraph.com', 'bearish', ARRAY['sec','stablecoin','regulation'], now() - interval '6 hours'),
  ('Solana network sees record DEX trading volume', 'Decrypt', 'https://decrypt.co', 'bullish', ARRAY['solana','dex','volume'], now() - interval '8 hours'),
  ('Market sentiment turns cautious ahead of Fed meeting', 'CoinDesk', 'https://coindesk.com', 'neutral', ARRAY['fed','market','sentiment'], now() - interval '12 hours')
ON CONFLICT DO NOTHING;

INSERT INTO signals (engine_slug, title, message, status, source_url, pair, sentiment, created_at)
VALUES
  ('scalping', 'BTC RSI Oversold Bounce', 'BTC RSI at 28 — potential bounce entry. EMA cross confirmed.', 'sent', 'https://tradingview.com', 'BTC/USDT', 'bullish', now() - interval '1 hour'),
  ('meme', 'WIF liquidity surge', 'WIF 24h volume up 340%. Liquidity above $2M threshold.', 'sent', 'https://dexscreener.com', 'WIF/SOL', 'bullish', now() - interval '2 hours'),
  ('whale', 'Large ETH outflow detected', '45,000 ETH moved to exchange wallet — $145.9M', 'sent', 'https://whale-alert.io', 'ETH', 'bearish', now() - interval '3 hours'),
  ('news', 'Bearish regulatory news', 'SEC announces stablecoin review — market impact expected', 'pending', 'https://cointelegraph.com', null, 'bearish', now() - interval '30 minutes'),
  ('scalping', 'SOL EMA bearish cross', 'SOL EMA fast crossed below slow — downtrend signal.', 'failed', 'https://tradingview.com', 'SOL/USDT', 'bearish', now() - interval '5 hours')
ON CONFLICT DO NOTHING;
