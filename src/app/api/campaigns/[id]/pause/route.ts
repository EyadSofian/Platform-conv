import { CampaignStatus } from "@prisma/client";
import { apiError, handleRouteError, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { emitRealtime } from "@/lib/realtime";

export const runtime = "nodejs";

export async function PATCH(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const campaign = await prisma.campaign.update({
      where: { id: params.id },
      data: { status: CampaignStatus.PAUSED },
    });

    await emitRealtime({ type: "campaign.updated", payload: campaign });
    return ok(campaign);
  } catch (error) {
    if (error instanceof Error && error.message.includes("Record to update")) {
      return apiError("Campaign not found.", 404);
    }
    return handleRouteError(error);
  }
}
