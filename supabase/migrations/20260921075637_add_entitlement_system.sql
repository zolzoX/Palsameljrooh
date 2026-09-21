-- 1. Add explicit entitlement column to signals
ALTER TABLE signals ADD COLUMN IF NOT EXISTS entitlement text NOT NULL DEFAULT 'free';

-- Backfill existing signals from is_vip
UPDATE signals SET entitlement = 'vip' WHERE is_vip = true;
UPDATE signals SET entitlement = 'free' WHERE is_vip = false OR is_vip IS NULL;

-- 2. Create persistent meme counter table (atomic, race-safe)
CREATE TABLE IF NOT EXISTS meme_counter (
  id integer PRIMARY KEY DEFAULT 1,
  counter integer NOT NULL DEFAULT 0,
  free_count integer NOT NULL DEFAULT 0,
  vip_count integer NOT NULL DEFAULT 0,
  last_signal_at timestamptz,
  CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO meme_counter (id, counter, free_count, vip_count)
VALUES (1, 0, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- 3. Add scalper_vip_threshold to signal_config (default 5, current behavior unchanged)
ALTER TABLE signal_config ADD COLUMN IF NOT EXISTS scalper_vip_threshold integer NOT NULL DEFAULT 5;

-- 4. Add entitlement to signal_deliveries for tracking
ALTER TABLE signal_deliveries ADD COLUMN IF NOT EXISTS entitlement text NOT NULL DEFAULT 'free';
