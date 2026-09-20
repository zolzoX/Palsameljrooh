/*
# Add per-bot VIP subscription configuration

## Problem
Currently there is one global vip_settings row for the whole system. 
The user wants to create multiple VIP channels, each with its own subscription bot, 
welcome message, wallet addresses, plans, and unlock link.

## Changes

### 1. New columns on `telegram_bots`
- `linked_vip_bot_id` (uuid, nullable) — set on FREE channel bots. Points to the 
  VIP channel bot that this free channel promotes. When a locked signal is posted 
  to this free channel, the "Unlock VIP" button uses the linked VIP bot's 
  subscribe_url.
- `sub_bot_token` (text, nullable) — set on VIP channel bots. The Telegram bot token 
  for this VIP channel's dedicated subscription bot.
- `sub_bot_username` (text, nullable) — the @username or t.me link of the 
  subscription bot (e.g. https://t.me/palsamicos_vip_subs_bot).
- `sub_welcome_message` (text, nullable) — the welcome message shown when a user 
  clicks /start on this VIP channel's subscription bot.
- `sub_wallet_trc20` (text, nullable) — USDT TRC20 wallet for this VIP channel.
- `sub_wallet_bep20` (text, nullable) — USDT BEP20 wallet for this VIP channel.
- `sub_wallet_erc20` (text, nullable) — USDT ERC20 wallet for this VIP channel.
- `sub_admin_username` (text, nullable) — admin username for payment proof.

### 2. `vip_plans` table
- Add `bot_id` column (uuid, nullable, references telegram_bots) so each VIP 
  channel bot can have its own set of subscription plans. Existing plans 
  (bot_id = NULL) remain as global fallback plans.

### 3. Security
- RLS already enabled on telegram_bots and vip_plans. Existing policies allow 
  anon/authenticated CRUD. No policy changes needed.
*/

-- 1. Add per-bot VIP config columns to telegram_bots
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'telegram_bots' AND column_name = 'linked_vip_bot_id') THEN
    ALTER TABLE telegram_bots ADD COLUMN linked_vip_bot_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'telegram_bots' AND column_name = 'sub_bot_token') THEN
    ALTER TABLE telegram_bots ADD COLUMN sub_bot_token text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'telegram_bots' AND column_name = 'sub_bot_username') THEN
    ALTER TABLE telegram_bots ADD COLUMN sub_bot_username text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'telegram_bots' AND column_name = 'sub_welcome_message') THEN
    ALTER TABLE telegram_bots ADD COLUMN sub_welcome_message text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'telegram_bots' AND column_name = 'sub_wallet_trc20') THEN
    ALTER TABLE telegram_bots ADD COLUMN sub_wallet_trc20 text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'telegram_bots' AND column_name = 'sub_wallet_bep20') THEN
    ALTER TABLE telegram_bots ADD COLUMN sub_wallet_bep20 text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'telegram_bots' AND column_name = 'sub_wallet_erc20') THEN
    ALTER TABLE telegram_bots ADD COLUMN sub_wallet_erc20 text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'telegram_bots' AND column_name = 'sub_admin_username') THEN
    ALTER TABLE telegram_bots ADD COLUMN sub_admin_username text;
  END IF;
END $$;

-- 2. Add bot_id to vip_plans for per-bot plans
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vip_plans' AND column_name = 'bot_id') THEN
    ALTER TABLE vip_plans ADD COLUMN bot_id uuid REFERENCES telegram_bots(id) ON DELETE CASCADE;
  END IF;
END $$;
