/*
# Add referral links table and stocks/commodities support

1. New Tables
- `referral_links` — stores referral links for exchanges and services
- `stock_pairs` — stores stocks/commodities tracked via Binance

2. Security
- Enable RLS on both tables.
- Allow anon + authenticated CRUD (single-tenant admin panel, no auth).
*/

CREATE TABLE IF NOT EXISTS referral_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_name text NOT NULL,
  label text,
  referral_url text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE referral_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_referral_links" ON referral_links;
CREATE POLICY "anon_select_referral_links" ON referral_links FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_referral_links" ON referral_links;
CREATE POLICY "anon_insert_referral_links" ON referral_links FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_referral_links" ON referral_links;
CREATE POLICY "anon_update_referral_links" ON referral_links FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_referral_links" ON referral_links;
CREATE POLICY "anon_delete_referral_links" ON referral_links FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS stock_pairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  name text,
  asset_class text DEFAULT 'stock',
  source text DEFAULT 'binance',
  api_symbol text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE stock_pairs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_stock_pairs" ON stock_pairs;
CREATE POLICY "anon_select_stock_pairs" ON stock_pairs FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_stock_pairs" ON stock_pairs;
CREATE POLICY "anon_insert_stock_pairs" ON stock_pairs FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_stock_pairs" ON stock_pairs;
CREATE POLICY "anon_update_stock_pairs" ON stock_pairs FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_stock_pairs" ON stock_pairs;
CREATE POLICY "anon_delete_stock_pairs" ON stock_pairs FOR DELETE
  TO anon, authenticated USING (true);

INSERT INTO stock_pairs (symbol, name, asset_class, source, api_symbol) VALUES
  ('XAU', 'Gold', 'commodity', 'binance', 'XAUUSDT'),
  ('XAG', 'Silver', 'commodity', 'binance', 'XAGUSDT'),
  ('OIL', 'Crude Oil', 'commodity', 'binance', 'OILUSDT'),
  ('AAPL', 'Apple Inc', 'stock', 'binance', 'AAPLUSDT'),
  ('TSLA', 'Tesla', 'stock', 'binance', 'TSLAUSDT'),
  ('NVDA', 'NVIDIA', 'stock', 'binance', 'NVDAUSDT'),
  ('AMZN', 'Amazon', 'stock', 'binance', 'AMZNUSDT'),
  ('SP500', 'S&P 500 Index', 'index', 'binance', 'SP500USDT')
ON CONFLICT DO NOTHING;
