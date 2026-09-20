/*
# Add timeframe column to signals table

1. Modified Tables
   - `signals` — add `timeframe` text column (default '1h') to support 15m/1h/4h timeframes
2. Security
   - No RLS changes needed — existing policies cover the new column automatically.
3. Notes
   - Uses DO $$ block to conditionally add the column only if it doesn't already exist,
     making the migration safe to re-run.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signals' AND column_name = 'timeframe'
  ) THEN
    ALTER TABLE signals ADD COLUMN timeframe text NOT NULL DEFAULT '1h';
  END IF;
END $$;
