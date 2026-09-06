-- Normalize existing "Friendship" and "Conversation" rows to the canonical
-- (min, max) pair ordering used by lib/pairs.ts normalizePair(), so newly
-- created rows and legacy rows converge over time. Reads keep matching both
-- orders via pairWhere(), so this migration is not required for correctness,
-- only for consistency.
--
-- Idempotent and safe when both (A,B) and (B,A) legacy rows exist for the
-- same pair: a row is only swapped when its swapped pair does NOT already
-- exist as another row, so this never violates the @@unique([userAId, userBId])
-- constraint and never produces duplicate pairs. Any remaining (A,B)/(B,A)
-- duplicates are left as-is; pairWhere() still matches them on read.

-- Friendship
UPDATE "Friendship" AS t
SET "userAId" = t."userBId",
    "userBId" = t."userAId"
WHERE t."userAId" > t."userBId"
  AND NOT EXISTS (
    SELECT 1 FROM "Friendship" f2
    WHERE f2."userAId" = t."userBId" AND f2."userBId" = t."userAId"
  );

-- Conversation
UPDATE "Conversation" AS t
SET "userAId" = t."userBId",
    "userBId" = t."userAId"
WHERE t."userAId" > t."userBId"
  AND NOT EXISTS (
    SELECT 1 FROM "Conversation" c2
    WHERE c2."userAId" = t."userBId" AND c2."userBId" = t."userAId"
  );
