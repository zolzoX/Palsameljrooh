-- Add TP hit tracking + VIP signal flag to signals table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signals' AND column_name = 'tp1_hit') THEN
    ALTER TABLE signals ADD COLUMN tp1_hit boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signals' AND column_name = 'tp2_hit') THEN
    ALTER TABLE signals ADD COLUMN tp2_hit boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signals' AND column_name = 'tp3_hit') THEN
    ALTER TABLE signals ADD COLUMN tp3_hit boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signals' AND column_name = 'is_vip') THEN
    ALTER TABLE signals ADD COLUMN is_vip boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signals' AND column_name = 'entry_price') THEN
    ALTER TABLE signals ADD COLUMN entry_price numeric DEFAULT null;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signals' AND column_name = 'tp1_price') THEN
    ALTER TABLE signals ADD COLUMN tp1_price numeric DEFAULT null;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signals' AND column_name = 'tp2_price') THEN
    ALTER TABLE signals ADD COLUMN tp2_price numeric DEFAULT null;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signals' AND column_name = 'tp3_price') THEN
    ALTER TABLE signals ADD COLUMN tp3_price numeric DEFAULT null;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signals' AND column_name = 'stop_loss_price') THEN
    ALTER TABLE signals ADD COLUMN stop_loss_price numeric DEFAULT null;
  END IF;
END $$;

-- Add new indicator config columns to signal_config for VIP indicators
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signal_config' AND column_name = 'stoch_k_period') THEN
    ALTER TABLE signal_config ADD COLUMN stoch_k_period integer DEFAULT 14;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signal_config' AND column_name = 'stoch_d_period') THEN
    ALTER TABLE signal_config ADD COLUMN stoch_d_period integer DEFAULT 3;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signal_config' AND column_name = 'stoch_oversold') THEN
    ALTER TABLE signal_config ADD COLUMN stoch_oversold numeric DEFAULT 20;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signal_config' AND column_name = 'stoch_overbought') THEN
    ALTER TABLE signal_config ADD COLUMN stoch_overbought numeric DEFAULT 80;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signal_config' AND column_name = 'adx_period') THEN
    ALTER TABLE signal_config ADD COLUMN adx_period integer DEFAULT 14;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signal_config' AND column_name = 'adx_threshold') THEN
    ALTER TABLE signal_config ADD COLUMN adx_threshold numeric DEFAULT 25;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signal_config' AND column_name = 'vwap_period') THEN
    ALTER TABLE signal_config ADD COLUMN vwap_period integer DEFAULT 20;
  END IF;
END $$;
