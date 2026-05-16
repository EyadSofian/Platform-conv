import { CampaignStatus } from "@prisma/client";
import { apiError, handleRouteError, ok } from "@/lib/api";
import { enqueueCampaignSend } from "@/lib/campaign-queue";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: params.id },
    });

    if (!campaign) return apiError("Campaign not found.", 404);
    if (campaign.status === CampaignStatus.PAUSED) {
      return apiError("Resume the campaign before sending.", 409);
    }

    const result = await enqueueCampaignSend(params.id);
    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
