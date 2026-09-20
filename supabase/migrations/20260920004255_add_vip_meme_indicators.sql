ALTER TABLE meme_tokens
  ADD COLUMN IF NOT EXISTS smart_money_flow TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS holder_concentration TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS liquidity_health TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS vip_indicators JSONB DEFAULT '[]'::jsonb;
