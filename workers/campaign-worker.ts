import { getCampaignQueue } from "../src/lib/campaign-queue";
import { sendCampaignNow } from "../src/services/campaign-service";

const queue = getCampaignQueue();

if (!queue) {
  console.log("[campaign-worker] REDIS_URL is not configured; nothing to run.");
  process.exit(0);
}

queue.process(async (job) => {
  console.log(`[campaign-worker] sending campaign ${job.data.campaignId}`);
  return sendCampaignNow(job.data.campaignId);
});

queue.on("completed", (job) => {
  console.log(`[campaign-worker] completed ${job.data.campaignId}`);
});

queue.on("failed", (job, error) => {
  console.error(
    `[campaign-worker] failed ${job?.data.campaignId ?? "unknown"}`,
    error,
  );
});
