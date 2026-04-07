-- reserve_send_slot: atomic daily-cap reservation for email approval flow.
-- Uses advisory lock to serialize concurrent approvals per user+day.
-- Returns true if slot was reserved (queued → sending), false if cap reached or row not eligible.

CREATE OR REPLACE FUNCTION reserve_send_slot(
  p_opportunity_id uuid,
  p_user_id uuid
) RETURNS boolean AS $$
DECLARE
  v_cap integer;
  v_used integer;
BEGIN
  -- Per-user/day advisory lock serializes concurrent approvals
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text || current_date::text));

  -- Count sent + currently sending (reserved) today
  SELECT count(*) INTO v_used FROM opportunities
  WHERE user_id = p_user_id
    AND (sent_at >= current_date OR stage = 'sending');

  SELECT daily_send_cap INTO v_cap FROM pipeline_config
  WHERE user_id = p_user_id;

  IF v_used >= COALESCE(v_cap, 10) THEN
    RETURN false;  -- cap reached
  END IF;

  -- Advance queued → sending (stage precondition prevents double-send)
  UPDATE opportunities SET stage = 'sending', updated_at = now()
  WHERE id = p_opportunity_id AND user_id = p_user_id AND stage = 'queued';

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;
