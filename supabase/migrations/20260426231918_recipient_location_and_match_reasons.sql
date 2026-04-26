ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS recipient_location text,
  ADD COLUMN IF NOT EXISTS recipient_match_reasons jsonb,
  ADD COLUMN IF NOT EXISTS alt_recipient_location text,
  ADD COLUMN IF NOT EXISTS alt_recipient_match_reasons jsonb;
