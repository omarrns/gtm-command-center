-- Helper RPC for incrementing attempt_count atomically
CREATE OR REPLACE FUNCTION increment_attempt_count(opp_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE opportunities
  SET attempt_count = attempt_count + 1
  WHERE id = opp_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION increment_attempt_count(uuid) TO service_role;
