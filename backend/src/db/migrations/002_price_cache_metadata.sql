-- Add metadata columns to price_cache so we can:
--   1. Distinguish a successful 0-price lookup from a failed/unknown one
--      (source='failed') and selectively retry failed entries later.
--   2. Know when each price was fetched, useful for cache freshness checks.
--
-- Existing rows get NULL for both columns; the application treats NULL as
-- "legacy/unknown — assume the price is valid".

ALTER TABLE price_cache ADD COLUMN source TEXT;
ALTER TABLE price_cache ADD COLUMN fetched_at TEXT;

-- Stamp existing rows with the current timestamp so they don't look "never fetched".
UPDATE price_cache SET fetched_at = CURRENT_TIMESTAMP WHERE fetched_at IS NULL;
