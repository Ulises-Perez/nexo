-- Indexes for foreign keys used by the hottest includes/joins.
-- PostgreSQL does not create indexes for FKs automatically.

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Attachment_messageId_idx" ON "Attachment"("messageId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Channel_categoryId_order_idx" ON "Channel"("categoryId", "order");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Category_communityId_order_idx" ON "Category"("communityId", "order");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CommunityBan_userId_idx" ON "CommunityBan"("userId");
