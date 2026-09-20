-- Add channel_type to vip_plans to distinguish between Signals VIP and Meme VIP
ALTER TABLE vip_plans ADD COLUMN IF NOT EXISTS channel_type text DEFAULT 'signals';

-- Add selected_channel to vip_subscriptions to track which channel the user chose
ALTER TABLE vip_subscriptions ADD COLUMN IF NOT EXISTS selected_channel text;

-- Add channel features text for display customization
ALTER TABLE vip_plans ADD COLUMN IF NOT EXISTS features text;
