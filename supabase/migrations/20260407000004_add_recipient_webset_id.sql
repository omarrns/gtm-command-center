-- Add recipient_webset_id to opportunities table.
-- The enrichment step needs the webset ID (not just the item ID) to call
-- POST /websets/{websetId}/enrichments per the Exa Websets API.
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS recipient_webset_id text;
