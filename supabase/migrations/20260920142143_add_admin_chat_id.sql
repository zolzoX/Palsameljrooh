-- Add admin chat ID for forwarding payment notifications
ALTER TABLE telegram_bots ADD COLUMN IF NOT EXISTS sub_admin_chat_id text;

-- Add admin chat ID to global vip_settings as well
ALTER TABLE vip_settings ADD COLUMN IF NOT EXISTS admin_chat_id text;
