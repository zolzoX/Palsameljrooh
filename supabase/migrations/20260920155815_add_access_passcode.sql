-- Add access passcode to vip_settings (configurable without redeploy)
ALTER TABLE vip_settings ADD COLUMN IF NOT EXISTS access_passcode text DEFAULT '1994996';

-- Track which users have passed the access gate
ALTER TABLE vip_subscriptions ADD COLUMN IF NOT EXISTS access_granted boolean DEFAULT false;
