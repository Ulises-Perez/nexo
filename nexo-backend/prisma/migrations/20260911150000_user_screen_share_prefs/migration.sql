-- Persist the user's last-used screen-share options (presetId, optimizeFor,
-- codec) at the account level so they follow the user across devices. The
-- column is private (only ever selected via ME_SELECT) and opaque JSON: the
-- backend does not interpret its shape beyond the bounded-string validation
-- applied on write, so new client-side presets never require a migration.

ALTER TABLE "User" ADD COLUMN "screenSharePrefs" JSONB;
