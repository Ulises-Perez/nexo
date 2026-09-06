-- Track the R2 object key an attachment points at, so cleanup code can
-- delete the exact object without reparsing it out of the stored CDN url.
-- Legacy rows are left NULL: attachmentCleanup.ts derives the key from
-- `url` at runtime for those, using the configured CDN prefixes, so no
-- backfill is required here.

ALTER TABLE "Attachment" ADD COLUMN "objectKey" TEXT;
