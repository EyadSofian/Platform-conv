import Queue from "bull";
import { sendCampaignNow } from "../services/campaign-service";

type CampaignJob = {
  campaignId: string;
};

let queue: Queue.Queue<CampaignJob> | null = null;

export function getCampaignQueue() {
  if (!process.env.REDIS_URL) return null;

  if (!queue) {
    queue = new Queue<CampaignJob>("campaign-sending", process.env.REDIS_URL);
  }

  return queue;
}

export async function enqueueCampaignSend(campaignId: string) {
  const campaignQueue = getCampaignQueue();

  if (!campaignQueue) {
    return sendCampaignNow(campaignId);
  }

  await campaignQueue.add(
    { campaignId },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );

  return { queued: true, campaignId };
}
