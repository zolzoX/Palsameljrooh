/*
# Add welcome message and free signal counter to VIP system

1. New Columns on `vip_settings`
- `welcome_message` (text) — Custom message shown when users click /start on the VIP subscription bot.
- `free_signal_counter` (integer, default 0) — Tracks how many unlocked signals have been sent to free channels. Every 3rd signal gets locked.

2. New Column on `telegram_bots`
- `bot_role` (text, default 'signal') — Identifies the bot's purpose:
  - 'free_signal' = Free public channel bot (posts 3 unlocked + 1 locked)
  - 'vip_signal' = VIP channel bot (posts full unlocked signals)
  - 'vip_subscription' = VIP subscription bot (handles plans, payments)
  This is separate from channel_type to support the 3-bot structure.

3. Security
- RLS already enabled on both tables. Policies already allow anon/authenticated CRUD.
*/

-- 1. Add welcome_message and free_signal_counter to vip_settings
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vip_settings' AND column_name = 'welcome_message') THEN
    ALTER TABLE vip_settings ADD COLUMN welcome_message text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vip_settings' AND column_name = 'free_signal_counter') THEN
    ALTER TABLE vip_settings ADD COLUMN free_signal_counter integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- 2. Add bot_role to telegram_bots
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'telegram_bots' AND column_name = 'bot_role') THEN
    ALTER TABLE telegram_bots ADD COLUMN bot_role text NOT NULL DEFAULT 'signal';
  END IF;
END $$;

-- Set existing free channel bots to free_signal role
UPDATE telegram_bots SET bot_role = 'free_signal' WHERE channel_type = 'free';
