-- Replace two-step claim with single atomic RPC
-- Scoped to user_id, sets processing_started_at AND increments attempt_count
CREATE OR REPLACE FUNCTION claim_opportunity(
  p_id uuid,
  p_user_id uuid
) RETURNS boolean AS $$
DECLARE
  v_stale_cutoff timestamptz := now() - interval '10 minutes';
BEGIN
  UPDATE opportunities
  SET processing_started_at = now(),
      attempt_count = attempt_count + 1,
      updated_at = now()
  WHERE id = p_id
    AND user_id = p_user_id
    AND (processing_started_at IS NULL OR processing_started_at < v_stale_cutoff);

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION claim_opportunity(uuid, uuid) TO service_role;

-- Drop the old non-atomic helper
DROP FUNCTION IF EXISTS increment_attempt_count(uuid);
