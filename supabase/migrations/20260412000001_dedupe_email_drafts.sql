-- Dedupe email_drafts so each opportunity has at most one, backfill any
-- missing selected_draft_id pointer, and enforce the invariant with a partial
-- unique index.

-- 1. For each opportunity with >1 draft, keep the one already selected
-- (preserves manual user picks); fall back to variant_index = 0.
-- Orphaned drafts (no opportunity_id) are untouched.
--
-- The first COALESCE branch is guarded by EXISTS: the selected_draft_id only
-- wins when it still resolves to a live draft under the same opportunity.
-- Otherwise we fall through to the variant_index=0 survivor. Without the
-- EXISTS guard, an orphaned selected_draft_id (pointing to an already-deleted
-- draft) would make the COALESCE return a dead UUID, which matches nothing —
-- so the DELETE would wipe every draft for that opportunity.
DELETE FROM email_drafts d
WHERE d.opportunity_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM email_drafts d2
    WHERE d2.opportunity_id = d.opportunity_id AND d2.id <> d.id
  )
  AND d.id <> COALESCE(
    (SELECT o.selected_draft_id
       FROM opportunities o
       WHERE o.id = d.opportunity_id
         AND EXISTS (
           SELECT 1 FROM email_drafts d2
           WHERE d2.id = o.selected_draft_id
             AND d2.opportunity_id = d.opportunity_id
         )),
    (SELECT d3.id FROM email_drafts d3
       WHERE d3.opportunity_id = d.opportunity_id
       ORDER BY variant_index ASC, created_at ASC
       LIMIT 1)
  );

-- 2. Backfill selected_draft_id for opportunities that have a draft but the
-- pointer is null or orphaned. After Block 1, each opportunity with drafts has
-- exactly one surviving row.
UPDATE opportunities o
SET selected_draft_id = (
  SELECT d.id FROM email_drafts d
  WHERE d.opportunity_id = o.id
  ORDER BY variant_index ASC
  LIMIT 1
)
WHERE EXISTS (SELECT 1 FROM email_drafts WHERE opportunity_id = o.id)
  AND (
    o.selected_draft_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM email_drafts WHERE id = o.selected_draft_id
    )
  );

-- 3. Enforce the invariant at the schema level.
-- Partial unique index: at most one email_drafts row per non-null
-- opportunity_id. Free-standing manual drafts (created from /outreach without
-- an opportunity link) are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS email_drafts_one_per_opportunity
  ON email_drafts (opportunity_id)
  WHERE opportunity_id IS NOT NULL;
