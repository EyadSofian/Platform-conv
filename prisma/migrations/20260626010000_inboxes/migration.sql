-- Platform-owned inboxes: each workspace can create operational inboxes that
-- own channel connection settings, bot/AI toggles, and conversation routing.

CREATE TYPE "InboxStatus" AS ENUM ('active', 'paused', 'disconnected');

CREATE TABLE "Inbox" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "channelType" "ChannelType" NOT NULL,
    "status" "InboxStatus" NOT NULL DEFAULT 'disconnected',
    "botEnabled" BOOLEAN NOT NULL DEFAULT true,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultAssigneeId" TEXT,
    "businessHours" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inbox_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ChannelAccount" ADD COLUMN "inboxId" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "inboxId" TEXT;

CREATE UNIQUE INDEX "ChannelAccount_inboxId_key" ON "ChannelAccount"("inboxId");
CREATE INDEX "Inbox_organizationId_status_idx" ON "Inbox"("organizationId", "status");
CREATE INDEX "Inbox_organizationId_channelType_idx" ON "Inbox"("organizationId", "channelType");
CREATE INDEX "Inbox_defaultAssigneeId_idx" ON "Inbox"("defaultAssigneeId");
CREATE INDEX "Conversation_organizationId_inboxId_idx" ON "Conversation"("organizationId", "inboxId");

ALTER TABLE "Inbox" ADD CONSTRAINT "Inbox_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Inbox" ADD CONSTRAINT "Inbox_defaultAssigneeId_fkey" FOREIGN KEY ("defaultAssigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChannelAccount" ADD CONSTRAINT "ChannelAccount_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;

