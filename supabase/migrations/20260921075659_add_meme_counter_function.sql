-- Atomic meme counter increment function (race-safe)
-- Returns the next sequence number and the entitlement ('free' or 'vip')
-- Rules: signals 1-3 = free, 4+ = vip
CREATE OR REPLACE FUNCTION increment_meme_counter()
RETURNS TABLE(seq_number integer, entitlement text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_counter integer;
  new_counter integer;
  new_entitlement text;
BEGIN
  -- Lock the single row for atomic update
  SELECT counter INTO current_counter FROM meme_counter WHERE id = 1 FOR UPDATE;
  
  new_counter := current_counter + 1;
  
  -- Entitlement: 1-3 = free, 4+ = vip
  IF new_counter <= 3 THEN
    new_entitlement := 'free';
  ELSE
    new_entitlement := 'vip';
  END IF;
  
  -- Update counter atomically
  IF new_entitlement = 'free' THEN
    UPDATE meme_counter 
    SET counter = new_counter, free_count = free_count + 1, last_signal_at = now()
    WHERE id = 1;
  ELSE
    UPDATE meme_counter 
    SET counter = new_counter, vip_count = vip_count + 1, last_signal_at = now()
    WHERE id = 1;
  END IF;
  
  RETURN QUERY SELECT new_counter, new_entitlement;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_meme_counter() TO authenticated, anon;
