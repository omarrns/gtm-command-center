-- ai_calls — capture every model call for post-hoc inspection and replay.
-- Service-role only; no client RLS. This is a debugging table, not user data.
--
-- Stored fields are best-effort: capture failure must NEVER break the actual
-- AI call, so the application writes here optimistically and ignores errors.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Correlation
  run_id text,
  user_id uuid,
  scope_table text,
  scope_id uuid,
  call_purpose text,

  -- Call params
  model text NOT NULL,
  call_kind text NOT NULL CHECK (call_kind IN ('text', 'json', 'object')),
  system_prompt text,
  user_prompt text,

  -- Response
  response_text text,
  response_object jsonb,

  -- Usage
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  latency_ms integer,

  -- Outcome
  error text
);

CREATE INDEX IF NOT EXISTS ai_calls_run_id_idx ON public.ai_calls (run_id);
CREATE INDEX IF NOT EXISTS ai_calls_user_id_idx ON public.ai_calls (user_id);
CREATE INDEX IF NOT EXISTS ai_calls_scope_idx
  ON public.ai_calls (scope_table, scope_id);
CREATE INDEX IF NOT EXISTS ai_calls_created_at_idx
  ON public.ai_calls (created_at DESC);

ALTER TABLE public.ai_calls ENABLE ROW LEVEL SECURITY;
-- No policies — service-role only.

COMMENT ON TABLE public.ai_calls IS
  'Debug capture of model calls. Service-role write only; never expose to clients.';

COMMIT;
