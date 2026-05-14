BEGIN;

ALTER TABLE public.pipeline_config
  ADD COLUMN IF NOT EXISTS activation_started_at timestamptz;

CREATE OR REPLACE FUNCTION public.claim_activation_run(
  p_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stale_cutoff timestamptz := now() - interval '10 minutes';
BEGIN
  UPDATE public.pipeline_config
  SET activation_started_at = now(),
      updated_at = now()
  WHERE user_id = p_user_id
    AND activation_completed_at IS NULL
    AND (
      activation_started_at IS NULL
      OR activation_started_at < v_stale_cutoff
    );

  RETURN FOUND;
END;
$$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.claim_opportunity(uuid, uuid)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.reserve_send_slot(uuid, uuid)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.claim_next_job(text[])
  SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.claim_activation_run(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_opportunity(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reserve_send_slot(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_next_job(text[]) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_activation_run(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_opportunity(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_send_slot(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_next_job(text[]) TO service_role;

COMMIT;
