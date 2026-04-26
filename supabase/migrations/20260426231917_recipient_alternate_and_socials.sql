ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS recipient_linkedin_url text,
  ADD COLUMN IF NOT EXISTS recipient_x_url text,
  ADD COLUMN IF NOT EXISTS recipient_picture_url text,
  ADD COLUMN IF NOT EXISTS alt_recipient_name text,
  ADD COLUMN IF NOT EXISTS alt_recipient_title text,
  ADD COLUMN IF NOT EXISTS alt_recipient_email text,
  ADD COLUMN IF NOT EXISTS alt_recipient_linkedin_url text,
  ADD COLUMN IF NOT EXISTS alt_recipient_x_url text,
  ADD COLUMN IF NOT EXISTS alt_recipient_picture_url text,
  ADD COLUMN IF NOT EXISTS alt_recipient_webset_id text,
  ADD COLUMN IF NOT EXISTS alt_recipient_webset_item_id text,
  ADD COLUMN IF NOT EXISTS alt_enrichment_attempts integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS jobs_gtm_find_contacts_pending_idx
  ON public.jobs (user_id, type, ((payload->>'opportunityId')))
  WHERE type = 'gtm-find-contacts'
    AND status = 'pending';
