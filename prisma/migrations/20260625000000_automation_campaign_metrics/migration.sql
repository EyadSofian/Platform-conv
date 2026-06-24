-- CreateEnum
CREATE TYPE "AutomationTriggerType" AS ENUM ('new_conversation', 'new_message', 'message_keyword', 'channel_is', 'tag_added', 'outside_business_hours', 'no_reply_after');

-- CreateEnum
CREATE TYPE "AutomationActionType" AS ENUM ('assign_agent', 'add_tag', 'send_template', 'send_webhook', 'create_lead', 'notify', 'handoff_botpress', 'close', 'snooze');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "failedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "queuedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "readCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "skippedCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "CampaignRecipient" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "failedReason" TEXT,
ADD COLUMN     "readAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "trigger" "AutomationTriggerType" NOT NULL,
    "triggerConfig" JSONB,
    "action" "AutomationActionType" NOT NULL,
    "actionConfig" JSONB,
    "lastRunAt" TIMESTAMP(3),
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutomationRule_organizationId_enabled_idx" ON "AutomationRule"("organizationId", "enabled");

-- CreateIndex
CREATE INDEX "AutomationRule_trigger_idx" ON "AutomationRule"("trigger");

-- CreateIndex
CREATE INDEX "CampaignRecipient_externalId_idx" ON "CampaignRecipient"("externalId");

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

